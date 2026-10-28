const mongoose = require("mongoose");
const MaterialRequest = require("../../models/MaterialRequest");
const Request = require("../../models/Request");

// ==========================================
// COMMON HELPERS
// ==========================================

const isValidId = (id) => mongoose.isValidObjectId(id);

const isPositiveQuantity = (value) =>
  Number.isFinite(Number(value)) && Number(value) > 0;

const roundQty = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;

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

  if (issued === total) return "ISSUED";

  if (issued > 0 || partialIssued) {
    return "PARTIALLY_ISSUED";
  }

  if (pending === total) return "PENDING";

  if (rejected === total) return "REJECTED";

  if (outOfStock === total) return "OUT_OF_STOCK";

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

// The new complaint workflow must continue
// using /api/maintenance/material-requests/create.
// This endpoint is retained only for legacy callers.

exports.createRequest = async (req, res) => {
  try {
    const { hostel, item, quantity } = req.body;

    if (
      typeof hostel !== "string" ||
      !hostel.trim() ||
      typeof item !== "string" ||
      !item.trim() ||
      !isPositiveQuantity(quantity)
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid hostel, item and positive quantity are required",
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
      .sort({ createdAt: -1 })
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
// UPDATE MATERIAL APPROVAL STATUS
// PUT /update-material/:requestId/:materialId
// ==========================================

exports.updateMaterialStatus = async (req, res) => {
  try {
    const { requestId, materialId } = req.params;

    const { status, approvedQuantity, storeRemarks } = req.body;

    if (!isValidId(requestId) || !isValidId(materialId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request or material ID",
      });
    }

    if (!["APPROVED", "REJECTED", "OUT_OF_STOCK"].includes(status)) {
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

    // Use atomic optimistic concurrency to prevent
    // two Store Managers overwriting each other.
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

      // Already-issued material must never be
      // approved or rejected again.
      if (
        Number(material.issuedQuantity || 0) > 0 ||
        ["ISSUED", "PARTIALLY_ISSUED"].includes(material.status)
      ) {
        return res.status(409).json({
          success: false,
          message:
            "This material has already been issued. Approval cannot be changed.",
        });
      }

      if (status === "APPROVED") {
        const qty =
          approvedQuantity === undefined ||
          approvedQuantity === null ||
          approvedQuantity === ""
            ? Number(material.quantity)
            : Number(approvedQuantity);

        if (!isPositiveQuantity(qty) || qty > Number(material.quantity)) {
          return res.status(400).json({
            success: false,
            message:
              "Approved quantity must be greater than zero and cannot exceed requested quantity",
          });
        }

        material.approvedQuantity = roundQty(qty);
        material.status = "APPROVED";

        request.approvedByStore = req.user._id;
        request.approvedAt = new Date();
      } else {
        material.approvedQuantity = 0;
        material.status = status;
      }

      material.storeRemarks =
        typeof storeRemarks === "string"
          ? storeRemarks.trim()
          : material.storeRemarks || "";

      request.status = calculateRequestStatus(request.materials);

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
          $inc: { __v: 1 },
        },
        { runValidators: true },
      );

      if (result.modifiedCount === 1) {
        const updatedRequest = await MaterialRequest.findById(requestId)
          .populate("requestedBy", "name role")
          .populate("assignedWorker", "name technicianId role");

        return res.status(200).json({
          success: true,
          message:
            status === "APPROVED"
              ? "Material approved successfully"
              : status === "REJECTED"
                ? "Material rejected"
                : "Material marked out of stock",
          request: updatedRequest,
        });
      }
    }

    return res.status(409).json({
      success: false,
      message: "Request was updated by another user. Refresh and try again.",
    });
  } catch (error) {
    console.error("UPDATE MATERIAL STATUS:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update material status",
    });
  }
};
