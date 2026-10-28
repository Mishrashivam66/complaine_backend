"use strict";

const crypto = require("crypto");
const mongoose = require("mongoose");

const MaterialRequest = require("../../models/MaterialRequest");
const Complaint = require("../../models/Complaint");

const MANAGER = "MAINTENANCE_MANAGER";
const TECHNICIAN = "TECHNICIAN";

const ACTIVE_REQUEST_STATUSES = [
  "PENDING",
  "APPROVED_BY_STORE",
  "PARTIALLY_APPROVED",
  "PARTIALLY_ISSUED",
];

const CLOSED_COMPLAINT_STATUSES = ["COMPLETED", "RESOLVED", "CLOSED"];

const VALID_UNITS = [
  "PIECE",
  "METER",
  "KG",
  "GRAM",
  "LITER",
  "ML",
  "BOX",
  "PACKET",
  "ROLL",
  "SET",
  "PAIR",
  "OTHER",
];

const upper = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const text = (value) => (typeof value === "string" ? value.trim() : "");

const userIdOf = (req) => req.user?._id || req.user?.id;

const validId = (id) => mongoose.isValidObjectId(id);

function fail(res, code, message) {
  return res.status(code).json({
    success: false,
    message,
  });
}

function isManager(req) {
  return upper(req.user?.role) === MANAGER;
}

function isTechnician(req) {
  return upper(req.user?.role) === TECHNICIAN;
}

// -------------------------------------------------------
// Common request populate configuration
// -------------------------------------------------------

function populateRequests(query) {
  return query
    .populate({
      path: "complaint",
      select: [
        "complaintId",
        "title",
        "titleHindi",
        "description",
        "descriptionHindi",
        "complaintArea",
        "hostel",
        "block",
        "floor",
        "roomNumber",
        "issueLocation",
        "category",
        "priority",
        "status",
        "assignedTo",
        "createdBy",
      ].join(" "),
      populate: [
        {
          path: "assignedTo",
          select: "name phone department shift",
        },
        {
          path: "createdBy",
          select: "name email phone",
        },
      ],
    })
    .populate("requestedBy", "name role")
    .populate("assignedWorker", "name phone department shift")
    .populate("approvedByStore", "name role")
    .populate("issuedBy", "name role");
}

// -------------------------------------------------------
// GET ALL
// Maintenance Manager + Store Manager only
// -------------------------------------------------------

exports.getAllMaterialRequests = async (req, res) => {
  try {
    const requests = await populateRequests(
      MaterialRequest.find().sort({ createdAt: -1 }),
    );

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    console.error("GET ALL MATERIAL REQUESTS ERROR:", error);

    return fail(res, 500, "Failed to fetch material requests");
  }
};

// -------------------------------------------------------
// GET MY REQUESTS
// Technician sees requests linked to currently assigned
// complaints, including Manager-created requests.
// -------------------------------------------------------

exports.getMyMaterialRequests = async (req, res) => {
  try {
    const technicianId = userIdOf(req);

    if (!validId(technicianId)) {
      return fail(res, 401, "Invalid Technician session");
    }

    const complaints = await Complaint.find({
      assignedTo: technicianId,
    })
      .select("_id")
      .lean();

    const complaintIds = complaints.map((c) => c._id);

    if (complaintIds.length === 0) {
      return res.json({
        success: true,
        count: 0,
        requests: [],
      });
    }

    const requests = await populateRequests(
      MaterialRequest.find({
        complaint: { $in: complaintIds },
      }).sort({ createdAt: -1 }),
    );

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    console.error("GET TECHNICIAN MATERIAL REQUESTS ERROR:", error);

    return fail(res, 500, "Unable to load your material requests");
  }
};

// -------------------------------------------------------
// GET REQUESTS BY COMPLAINT
// Manager: any complaint
// Technician: only currently assigned complaint
// -------------------------------------------------------

exports.getComplaintMaterialRequests = async (req, res) => {
  try {
    const complaintId = req.params.complaintId;

    if (!validId(complaintId)) {
      return fail(res, 400, "Invalid complaint ID");
    }

    const complaint = await Complaint.findById(complaintId)
      .select("_id assignedTo")
      .lean();

    if (!complaint) {
      return fail(res, 404, "Complaint not found");
    }

    if (isTechnician(req)) {
      const technicianId = userIdOf(req);

      if (
        !validId(technicianId) ||
        String(complaint.assignedTo || "") !== String(technicianId)
      ) {
        return fail(
          res,
          403,
          "You can only view requests for your assigned complaints",
        );
      }
    } else if (!isManager(req)) {
      return fail(res, 403, "Access denied");
    }

    const requests = await populateRequests(
      MaterialRequest.find({
        complaint: complaint._id,
      }).sort({ createdAt: -1 }),
    );

    return res.json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    console.error("GET COMPLAINT MATERIAL REQUESTS ERROR:", error);

    return fail(res, 500, "Unable to fetch complaint material requests");
  }
};

// -------------------------------------------------------
// CREATE REQUEST
// Manager: before or after assignment
// Technician: only on own assigned active complaint
// No automatic Job Card
// -------------------------------------------------------

exports.createMaterialRequest = async (req, res) => {
  try {
    const requesterId = userIdOf(req);

    if (!validId(requesterId)) {
      return fail(res, 401, "Invalid login session");
    }

    const { complaintId, materials, reason } = req.body || {};

    if (!validId(complaintId)) {
      return fail(res, 400, "Valid Complaint ID is required");
    }

    if (!Array.isArray(materials) || materials.length === 0) {
      return fail(res, 400, "At least one material is required");
    }

    if (materials.length > 30) {
      return fail(res, 400, "Maximum 30 materials allowed per request");
    }

    const cleanReason = text(reason);

    if (cleanReason.length < 5 || cleanReason.length > 1000) {
      return fail(res, 400, "Reason must contain 5 to 1000 characters");
    }

    // Server-only validation.
    // Never trust quantity, role or assignedWorker
    // values sent by frontend.

    const cleanMaterials = [];
    const seen = new Set();

    for (const material of materials) {
      const itemName = text(material?.itemName);
      const unit = upper(material?.unit || "PIECE");
      const quantity = Number(material?.quantity);

      if (!itemName || itemName.length > 150) {
        return fail(res, 400, "Material name must contain 1 to 150 characters");
      }

      if (!Number.isFinite(quantity) || quantity < 0.01 || quantity > 1000000) {
        return fail(res, 400, "Each quantity must be between 0.01 and 1000000");
      }

      if (!VALID_UNITS.includes(unit)) {
        return fail(res, 400, `Invalid unit for ${itemName}`);
      }

      const identity = `${itemName.toLowerCase()}|${unit}`;

      if (seen.has(identity)) {
        return fail(
          res,
          400,
          `Duplicate material: ${itemName}. Combine quantities.`,
        );
      }

      seen.add(identity);

      cleanMaterials.push({
        itemName,
        quantity,
        unit,
        approvedQuantity: 0,
        issuedQuantity: 0,
        status: "PENDING",
      });
    }

    const complaint = await Complaint.findById(complaintId);

    if (!complaint) {
      return fail(res, 404, "Complaint not found");
    }

    if (CLOSED_COMPLAINT_STATUSES.includes(upper(complaint.status))) {
      return fail(
        res,
        409,
        "Cannot request materials for completed or resolved complaints",
      );
    }

    if (isTechnician(req)) {
      if (String(complaint.assignedTo || "") !== String(requesterId)) {
        return fail(
          res,
          403,
          "You can only request materials for complaints assigned to you",
        );
      }

      // Prevent requesting materials for inactive stages.
      if (
        !["ASSIGNED", "IN_PROGRESS", "REOPENED", "WAITING_MATERIAL"].includes(
          upper(complaint.status),
        )
      ) {
        return fail(
          res,
          409,
          "Complaint is not eligible for a Technician material request",
        );
      }
    } else if (!isManager(req)) {
      return fail(
        res,
        403,
        "You do not have permission to create material requests",
      );
    }

    // Existing active requests from either Manager or
    // Technician must be considered to avoid duplication.

    const existing = await MaterialRequest.findOne({
      complaint: complaint._id,
      status: {
        $in: ACTIVE_REQUEST_STATUSES,
      },
    })
      .select("_id requestId status")
      .lean();

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "An active material request already exists for this complaint",
        existingRequest: {
          _id: existing._id,
          requestId: existing.requestId,
          status: existing.status,
        },
      });
    }

    const requestId =
      `MAT-${Date.now()}-` +
      crypto.randomBytes(4).toString("hex").toUpperCase();

    const request = await MaterialRequest.create({
      requestId,
      complaint: complaint._id,

      // May be null if Manager requests before assignment.
      assignedWorker: complaint.assignedTo || null,

      requestedBy: requesterId,
      materials: cleanMaterials,
      reason: cleanReason,
      status: "PENDING",

      // No Job Card is created automatically.
      jobCard: null,
    });

    // Preserve the current complaint status.
    // A request must not silently overwrite IN_PROGRESS
    // or REOPENED status.
    //
    // Reflect that material is required.
    await Complaint.updateOne(
      {
        _id: complaint._id,
      },
      {
        $set: {
          materialRequired: true,
          materialDecision: "REQUIRED",
        },
      },
    );

    return res.status(201).json({
      success: true,
      message: "Material request created successfully",
      request,
    });
  } catch (error) {
    console.error("CREATE MATERIAL REQUEST ERROR:", error);

    if (error?.code === 11000) {
      return fail(res, 409, "Duplicate request ID. Please retry.");
    }

    if (error?.name === "ValidationError") {
      return fail(res, 400, error.message);
    }

    return fail(res, 500, "Unable to create material request");
  }
};

// -------------------------------------------------------
// DELETE PENDING REQUEST
// Only Manager, preserves existing permissions.
// -------------------------------------------------------

exports.deleteMaterialRequest = async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return fail(res, 400, "Invalid material request ID");
    }

    const deleted = await MaterialRequest.findOneAndDelete({
      _id: req.params.id,
      status: "PENDING",
    });

    if (!deleted) {
      const exists = await MaterialRequest.exists({
        _id: req.params.id,
      });

      return fail(
        res,
        exists ? 409 : 404,
        exists
          ? "Only pending material requests can be deleted"
          : "Material request not found",
      );
    }

    // Do not automatically clear materialRequired:
    // another historical material request may exist,
    // and Manager may have set a separate requirement.

    return res.status(200).json({
      success: true,
      message: "Material request deleted successfully",
    });
  } catch (error) {
    console.error("DELETE MATERIAL REQUEST ERROR:", error);

    return fail(res, 500, "Unable to delete material request");
  }
};
