"use strict";

const mongoose = require("mongoose");

const MaterialRequest = require("../../models/MaterialRequest");
const Request = require("../../models/Request");
const IssuedItem = require("../../models/IssuedItem");

// ==========================================
// COMMON HELPERS
// ==========================================

const isValidId = (id) => mongoose.isValidObjectId(id);

const isPositiveQuantity = (value) =>
  value !== "" &&
  value !== null &&
  value !== undefined &&
  typeof value !== "boolean" &&
  Number.isFinite(Number(value)) &&
  Number(value) > 0;

const isValidPrecision = (value) => {
  const number = Number(value);

  return (
    Number.isFinite(number) &&
    Math.abs(number * 1000 - Math.round(number * 1000)) < 1e-7
  );
};

const roundQty = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;

// ==========================================
// CALCULATE OVERALL REQUEST STATUS
// ==========================================

function calculateRequestStatus(materials) {
  const items = Array.from(materials || []);

  const total = items.length;

  const issued = items.filter((m) => m.status === "ISSUED").length;

  const partialIssued = items.some((m) => m.status === "PARTIALLY_ISSUED");

  const approved = items.filter((m) => m.status === "APPROVED").length;

  const pending = items.filter((m) => m.status === "PENDING").length;

  const rejected = items.filter((m) => m.status === "REJECTED").length;

  const outOfStock = items.filter((m) => m.status === "OUT_OF_STOCK").length;

  if (!total) return "PENDING";

  if (issued === total) {
    return "ISSUED";
  }

  if (issued > 0 || partialIssued) {
    return "PARTIALLY_ISSUED";
  }

  if (pending === total) {
    return "PENDING";
  }

  if (rejected === total) {
    return "REJECTED";
  }

  if (outOfStock === total) {
    return "OUT_OF_STOCK";
  }

  if (
    pending === 0 &&
    approved > 0 &&
    approved === total &&
    items.every((m) => Number(m.approvedQuantity) >= Number(m.quantity))
  ) {
    return "APPROVED_BY_STORE";
  }

  return "PARTIALLY_APPROVED";
}

// ==========================================
// CREATE LEGACY GENERAL STORE REQUEST
// POST /add
// ==========================================
// Complaint material requests continue using
// the maintenance material-request workflow.
// ==========================================

exports.createRequest = async (req, res) => {
  try {
    const { hostel, item, quantity } = req.body || {};

    if (
      typeof hostel !== "string" ||
      !hostel.trim() ||
      typeof item !== "string" ||
      !item.trim() ||
      !isPositiveQuantity(quantity) ||
      !isValidPrecision(quantity)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid hostel, item and positive quantity with up to three decimal places are required",
      });
    }

    const request = await Request.create({
      hostel: hostel.trim(),
      item: item.trim(),
      quantity: roundQty(quantity),
      requestedBy:
        req.user?.name ||
        req.user?.email ||
        String(req.user?._id || "Maintenance Manager"),
    });

    return res.status(201).json({
      success: true,
      message: "General store request created successfully",
      request,
    });
  } catch (error) {
    console.error("CREATE STORE REQUEST:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create store request",
    });
  }
};

// ==========================================
// GET COMPLAINT MATERIAL REQUESTS
// GET /all
// ==========================================

exports.getRequests = async (req, res) => {
  try {
    const { status, requestedByRole } = req.query;

    const filter = {};

    if (status && status !== "ALL") {
      const allowed = [
        "PENDING",
        "APPROVED_BY_STORE",
        "PARTIALLY_APPROVED",
        "PARTIALLY_ISSUED",
        "REJECTED",
        "OUT_OF_STOCK",
        "ISSUED",
      ];

      if (!allowed.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid request status filter",
        });
      }

      filter.status = status;
    }

    let requests = await MaterialRequest.find(filter)
      .populate({
        path: "complaint",
        select: `
          complaintId
          title
          hostel
          block
          floor
          roomNumber
          category
          priority
          status
          assignedTo
        `,
      })
      .populate(
        "assignedWorker",
        "name phone department shift technicianId role",
      )
      .populate("requestedBy", "name role")
      .populate("approvedByStore", "name role")
      .populate("issuedBy", "name role")
      .sort({
        createdAt: -1,
      })
      .lean();

    if (requestedByRole && requestedByRole !== "ALL") {
      requests = requests.filter(
        (request) => request.requestedBy?.role === requestedByRole,
      );
    }

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    console.error("STORE GET REQUESTS:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load material requests",
    });
  }
};

// ==========================================
// APPROVE / EDIT APPROVAL / REJECT
// PUT /update-material/:requestId/:materialId
// ==========================================

exports.updateMaterialStatus = async (req, res) => {
  try {
    const { requestId, materialId } = req.params;

    const { status, approvedQuantity, storeRemarks } = req.body || {};

    // --------------------------------------
    // VALIDATE IDs
    // --------------------------------------

    if (!isValidId(requestId) || !isValidId(materialId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request or material ID",
      });
    }

    // --------------------------------------
    // VALIDATE ACTION
    // --------------------------------------

    const allowedStatuses = ["APPROVED", "REJECTED", "OUT_OF_STOCK"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid material approval status",
      });
    }

    if (storeRemarks !== undefined && typeof storeRemarks !== "string") {
      return res.status(400).json({
        success: false,
        message: "Store remarks must be text",
      });
    }

    // --------------------------------------
    // OPTIMISTIC CONCURRENCY RETRIES
    // --------------------------------------

    for (let attempt = 0; attempt < 3; attempt++) {
      const request = await MaterialRequest.findById(requestId);

      if (!request) {
        return res.status(404).json({
          success: false,
          message: "Material request not found",
        });
      }

      const material = request.materials.id(materialId);

      if (!material) {
        return res.status(404).json({
          success: false,
          message: "Material item not found",
        });
      }

      // ------------------------------------
      // BLOCK CHANGES AFTER ISSUE
      // ------------------------------------

      const issuedQuantity = Number(material.issuedQuantity || 0);

      const alreadyIssued =
        issuedQuantity > 0 ||
        ["ISSUED", "PARTIALLY_ISSUED"].includes(material.status);

      if (alreadyIssued) {
        return res.status(409).json({
          success: false,
          message:
            "This material has already been issued. Approval cannot be changed.",
        });
      }

      // Additional verification against the
      // permanent material issue register.
      const existingIssue = await IssuedItem.exists({
        materialRequest: request._id,
        materialItemId: material._id,
        status: {
          $in: ["Issued", "Delivered"],
        },
      });

      if (existingIssue) {
        return res.status(409).json({
          success: false,
          message:
            "A confirmed material issue record already exists. Approval cannot be edited.",
        });
      }

      const previousStatus = material.status;

      const previousApprovedQty = Number(material.approvedQuantity || 0);

      // ------------------------------------
      // APPROVE OR EDIT EXISTING APPROVAL
      // ------------------------------------

      if (status === "APPROVED") {
        const requestedQuantity = Number(material.quantity);

        // When editing without a new quantity,
        // preserve the already approved value.
        const fallbackQuantity =
          previousStatus === "APPROVED" && previousApprovedQty > 0
            ? previousApprovedQty
            : requestedQuantity;

        const qty =
          approvedQuantity === undefined ||
          approvedQuantity === null ||
          approvedQuantity === ""
            ? fallbackQuantity
            : Number(approvedQuantity);

        if (!isPositiveQuantity(qty) || !isValidPrecision(qty)) {
          return res.status(400).json({
            success: false,
            message:
              "Approved quantity must be positive with at most three decimal places.",
          });
        }

        if (!Number.isFinite(requestedQuantity) || qty > requestedQuantity) {
          return res.status(400).json({
            success: false,
            message:
              "Approved quantity cannot exceed the originally requested quantity.",
          });
        }

        material.approvedQuantity = roundQty(qty);

        material.status = "APPROVED";

        request.approvedByStore = req.user._id;

        // Preserve the existing approval date
        // when only editing its quantity.
        if (previousStatus !== "APPROVED" || !request.approvedAt) {
          request.approvedAt = new Date();
        }
      } else {
        // ----------------------------------
        // REJECT OR MARK OUT OF STOCK
        // ----------------------------------

        material.approvedQuantity = 0;
        material.status = status;
      }

      // ------------------------------------
      // REMARKS
      // ------------------------------------

      if (typeof storeRemarks === "string") {
        material.storeRemarks = storeRemarks.trim();
      }

      // ------------------------------------
      // RECALCULATE REQUEST STATUS
      // ------------------------------------

      request.status = calculateRequestStatus(request.materials);

      // ------------------------------------
      // ATOMIC VERSION CHECK
      // ------------------------------------
      // Competing approval updates must not
      // silently overwrite one another.
      // ------------------------------------

      const version = request.__v || 0;

      const result = await MaterialRequest.updateOne(
        {
          _id: request._id,
          __v: version,
        },
        {
          $set: {
            materials: request.materials,
            status: request.status,
            approvedByStore: request.approvedByStore,
            approvedAt: request.approvedAt,
            updatedAt: new Date(),
          },
          $inc: {
            __v: 1,
          },
        },
        {
          runValidators: true,
        },
      );

      if (result.modifiedCount === 1) {
        const updatedRequest = await MaterialRequest.findById(requestId)
          .populate("requestedBy", "name role")
          .populate("assignedWorker", "name technicianId role");

        const approvalEdited =
          status === "APPROVED" && previousStatus === "APPROVED";

        const message = approvalEdited
          ? "Approved quantity updated successfully"
          : status === "APPROVED"
            ? "Material approved successfully"
            : status === "REJECTED"
              ? "Material rejected"
              : "Material marked out of stock";

        return res.status(200).json({
          success: true,
          message,
          request: updatedRequest,
        });
      }
    }

    // --------------------------------------
    // CONCURRENT UPDATE FAILED
    // --------------------------------------

    return res.status(409).json({
      success: false,
      message: "Request was updated by another user. Refresh and try again.",
    });
  } catch (error) {
    console.error("UPDATE MATERIAL STATUS:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to update material status",
    });
  }
};
