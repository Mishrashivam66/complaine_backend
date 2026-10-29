"use strict";

const crypto = require("crypto");
const mongoose = require("mongoose");

const MaterialRequest = require("../../models/MaterialRequest");
const Complaint = require("../../models/Complaint");

// ==========================================
// CONSTANTS
// ==========================================

const MANAGER = "MAINTENANCE_MANAGER";
const TECHNICIAN = "TECHNICIAN";

const ACTIVE_REQUEST_STATUSES = [
  "PENDING",
  "APPROVED_BY_STORE",
  "PARTIALLY_APPROVED",
  "PARTIALLY_ISSUED",
];

const CLOSED_COMPLAINT_STATUSES = ["COMPLETED", "RESOLVED", "CLOSED"];

const ALLOWED_TECHNICIAN_STAGES = [
  "ASSIGNED",
  "IN_PROGRESS",
  "REOPENED",
  "WAITING_MATERIAL",
  "WAITING_FOR_MATERIAL",
];

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

// ==========================================
// HELPERS
// ==========================================

const upper = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const text = (value) => (typeof value === "string" ? value.trim() : "");

const userIdOf = (req) => req.user?._id || req.user?.id;

const validId = (id) => mongoose.isValidObjectId(id);

const roundQty = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;

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

function validQuantity(value) {
  const quantity = Number(value);

  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(quantity) &&
    quantity >= 0.01 &&
    quantity <= 1000000 &&
    Math.abs(quantity * 1000 - Math.round(quantity * 1000)) < 1e-7
  );
}

function hasStoreActivity(request) {
  if (
    request.approvedByStore ||
    request.issuedBy ||
    request.approvedAt ||
    request.issuedAt
  ) {
    return true;
  }

  return request.materials.some((item) => {
    return (
      Number(item.approvedQuantity || 0) > 0 ||
      Number(item.issuedQuantity || 0) > 0 ||
      item.status !== "PENDING"
    );
  });
}

function managerApprovedFilter() {
  return {
    managerApprovalStatus: "APPROVED",
  };
}

// ==========================================
// POPULATE REQUEST DETAILS
// ==========================================

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
    .populate("managerApprovedBy", "name role")
    .populate("approvedByStore", "name role")
    .populate("issuedBy", "name role");
}

// ==========================================
// GET ALL MATERIAL REQUESTS
//
// Manager sees all requests.
// Store sees manager-approved requests.
// ==========================================

exports.getAllMaterialRequests = async (req, res) => {
  try {
    const filter = {};

    if (upper(req.user?.role) === "STORE_MANAGER") {
      Object.assign(filter, managerApprovedFilter());
    } else if (!isManager(req)) {
      return fail(res, 403, "Access denied");
    }

    const requests = await populateRequests(
      MaterialRequest.find(filter).sort({ createdAt: -1 }),
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

// ==========================================
// GET TECHNICIAN'S MATERIAL REQUESTS
// ==========================================

exports.getMyMaterialRequests = async (req, res) => {
  try {
    if (!isTechnician(req)) {
      return fail(res, 403, "Technician access only");
    }

    const technicianId = userIdOf(req);

    if (!validId(technicianId)) {
      return fail(res, 401, "Invalid Technician session");
    }

    const complaints = await Complaint.find({
      assignedTo: technicianId,
    })
      .select("_id")
      .lean();

    const complaintIds = complaints.map((complaint) => complaint._id);

    if (complaintIds.length === 0) {
      return res.json({
        success: true,
        count: 0,
        requests: [],
      });
    }

    const requests = await populateRequests(
      MaterialRequest.find({
        complaint: {
          $in: complaintIds,
        },
      }).sort({ createdAt: -1 }),
    );

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    console.error("GET TECHNICIAN REQUESTS ERROR:", error);

    return fail(res, 500, "Unable to load your material requests");
  }
};

// ==========================================
// GET COMPLAINT-WISE MATERIAL REQUESTS
// ==========================================

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

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    console.error("GET COMPLAINT REQUESTS ERROR:", error);

    return fail(res, 500, "Unable to fetch complaint material requests");
  }
};

// ==========================================
// CREATE MATERIAL REQUEST
//
// Manager -> Direct Store workflow
// Technician -> Pending Manager approval
// ==========================================

exports.createMaterialRequest = async (req, res) => {
  try {
    const requesterId = userIdOf(req);

    if (!validId(requesterId)) {
      return fail(res, 401, "Invalid login session");
    }

    if (!isManager(req) && !isTechnician(req)) {
      return fail(res, 403, "Not authorized to request materials");
    }

    const { complaintId, materials, reason } = req.body || {};

    if (!validId(complaintId)) {
      return fail(res, 400, "Valid Complaint ID is required");
    }

    if (
      !Array.isArray(materials) ||
      materials.length === 0 ||
      materials.length > 30
    ) {
      return fail(res, 400, "Please provide 1 to 30 materials");
    }

    const cleanReason = text(reason);

    if (cleanReason.length < 5 || cleanReason.length > 1000) {
      return fail(res, 400, "Reason must contain 5 to 1000 characters");
    }

    // ======================================
    // VALIDATE MATERIALS
    // ======================================

    const cleanMaterials = [];
    const seen = new Set();

    for (const material of materials) {
      const itemName = text(material?.itemName);

      const unit = upper(material?.unit || "PIECE");

      const quantity = Number(material?.quantity);

      if (!itemName || itemName.length > 150) {
        return fail(res, 400, "Material name must contain 1 to 150 characters");
      }

      if (!validQuantity(material?.quantity)) {
        return fail(res, 400, `Invalid quantity for ${itemName}`);
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
        quantity: roundQty(quantity),
        unit,

        managerApprovedQuantity: isManager(req) ? roundQty(quantity) : 0,

        approvedQuantity: 0,
        issuedQuantity: 0,
        status: "PENDING",
        storeRemarks: "",
      });
    }

    // ======================================
    // COMPLAINT VALIDATION
    // ======================================

    const complaint = await Complaint.findById(complaintId);

    if (!complaint) {
      return fail(res, 404, "Complaint not found");
    }

    if (CLOSED_COMPLAINT_STATUSES.includes(upper(complaint.status))) {
      return fail(
        res,
        409,
        "Cannot request materials for a completed or resolved complaint",
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

      if (!ALLOWED_TECHNICIAN_STAGES.includes(upper(complaint.status))) {
        return fail(
          res,
          409,
          "Complaint is not eligible for a Technician material request",
        );
      }
    }

    // ======================================
    // PREVENT OVERLAPPING ACTIVE REQUESTS
    // ======================================

    // Allows a new request after the earlier
    // request is fully issued or rejected.
    // An active request for the same complaint
    // must be handled first.

    const existing = await MaterialRequest.findOne({
      complaint: complaint._id,
      status: {
        $in: ACTIVE_REQUEST_STATUSES,
      },
      managerApprovalStatus: {
        $ne: "REJECTED",
      },
    })
      .select("_id requestId status")
      .lean();

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "An active material request already exists for this complaint",
        existingRequest: existing,
      });
    }

    // ======================================
    // DETERMINE REQUEST SOURCE
    // ======================================

    const source = isTechnician(req) ? TECHNICIAN : MANAGER;

    const managerApproved = source === MANAGER;

    const requestId =
      `MAT-${Date.now()}-` +
      crypto.randomBytes(4).toString("hex").toUpperCase();

    const request = await MaterialRequest.create({
      requestId,

      complaint: complaint._id,
      jobCard: null,

      assignedWorker: complaint.assignedTo || null,

      requestedBy: requesterId,
      requestSource: source,

      materials: cleanMaterials,
      reason: cleanReason,

      managerApprovalStatus: managerApproved ? "APPROVED" : "PENDING",

      managerApprovedBy: managerApproved ? requesterId : null,

      managerApprovedAt: managerApproved ? new Date() : null,

      managerRejectedAt: null,
      managerRemarks: "",

      status: "PENDING",
    });

    // ======================================
    // FLAG MATERIAL REQUIREMENT
    // ======================================

    // Do not overwrite current complaint
    // status (IN_PROGRESS / REOPENED).

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

      message: managerApproved
        ? "Material request sent to Store Manager"
        : "Material request submitted for Maintenance Manager approval",

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

// ==========================================
// MANAGER APPROVE TECHNICIAN REQUEST
//
// PUT /:id/manager-approve
//
// Optional body:
// {
//   "remarks": "Approved",
//   "materials": [
//     {
//       "materialId": "...",
//       "approvedQuantity": 2
//     }
//   ]
// }
//
// If materials not supplied:
// Full requested quantity is approved.
// ==========================================

exports.approveTechnicianMaterialRequest = async (req, res) => {
  try {
    if (!isManager(req)) {
      return fail(res, 403, "Maintenance Manager access only");
    }

    const requestId = req.params.id;
    const managerId = userIdOf(req);

    if (!validId(requestId) || !validId(managerId)) {
      return fail(res, 400, "Invalid request or Manager ID");
    }

    const remarks = text(req.body?.remarks ?? req.body?.managerRemarks ?? "");

    if (remarks.length > 1000) {
      return fail(res, 400, "Remarks cannot exceed 1000 characters");
    }

    const suppliedMaterials = req.body?.materials;

    if (suppliedMaterials !== undefined && !Array.isArray(suppliedMaterials)) {
      return fail(res, 400, "Materials must be an array");
    }

    // ======================================
    // VALIDATE APPROVAL INPUT
    // ======================================

    const quantityMap = new Map();

    for (const item of suppliedMaterials || []) {
      const materialId = String(item?.materialId || "");

      if (!validId(materialId) || quantityMap.has(materialId)) {
        return fail(res, 400, "Invalid or duplicate material ID");
      }

      if (!validQuantity(item.approvedQuantity)) {
        return fail(
          res,
          400,
          "Approved quantity must be positive and support up to 3 decimal places",
        );
      }

      quantityMap.set(materialId, roundQty(item.approvedQuantity));
    }

    // ======================================
    // OPTIMISTIC CONCURRENCY CONTROL
    // ======================================

    for (let attempt = 0; attempt < 3; attempt++) {
      const request = await MaterialRequest.findById(requestId);

      if (!request) {
        return fail(res, 404, "Material request not found");
      }

      if (request.requestSource !== TECHNICIAN) {
        return fail(
          res,
          409,
          "This request does not require Technician approval",
        );
      }

      if (request.managerApprovalStatus !== "PENDING") {
        return fail(res, 409, "This request has already been reviewed");
      }

      if (hasStoreActivity(request)) {
        return fail(res, 409, "Store processing has already started");
      }

      if (
        quantityMap.size > 0 &&
        quantityMap.size !== request.materials.length
      ) {
        return fail(res, 400, "Provide approval quantities for all materials");
      }

      let approvedCount = 0;

      for (const item of request.materials) {
        const itemId = String(item._id);

        if (quantityMap.size > 0 && !quantityMap.has(itemId)) {
          return fail(res, 400, "Unknown or missing material ID");
        }

        const quantity =
          quantityMap.size > 0
            ? quantityMap.get(itemId)
            : Number(item.quantity);

        if (!validQuantity(quantity) || quantity > Number(item.quantity)) {
          return fail(
            res,
            400,
            `Invalid approved quantity for ${item.itemName}`,
          );
        }

        item.managerApprovedQuantity = roundQty(quantity);

        approvedCount++;
      }

      if (approvedCount !== request.materials.length) {
        return fail(res, 400, "Approval quantities are incomplete");
      }

      const now = new Date();

      const version = request.__v || 0;

      const result = await MaterialRequest.updateOne(
        {
          _id: request._id,
          __v: version,
          managerApprovalStatus: "PENDING",
        },
        {
          $set: {
            materials: request.materials,
            managerApprovalStatus: "APPROVED",
            managerApprovedBy: managerId,
            managerApprovedAt: now,
            managerRejectedAt: null,
            managerRemarks: remarks,
            updatedAt: now,
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
        const updatedRequest = await populateRequests(
          MaterialRequest.findById(requestId),
        );

        return res.status(200).json({
          success: true,
          message:
            "Technician material request approved and forwarded to Store Manager",
          request: updatedRequest,
        });
      }
    }

    return fail(
      res,
      409,
      "Request changed by another user. Refresh and try again.",
    );
  } catch (error) {
    console.error("MANAGER APPROVE REQUEST ERROR:", error);

    return fail(res, 500, "Unable to approve Technician material request");
  }
};

// ==========================================
// MANAGER REJECT TECHNICIAN REQUEST
//
// PUT /:id/manager-reject
//
// Body:
// {
//   "remarks": "Material not required"
// }
// ==========================================

exports.rejectTechnicianMaterialRequest = async (req, res) => {
  try {
    if (!isManager(req)) {
      return fail(res, 403, "Maintenance Manager access only");
    }

    const requestId = req.params.id;
    const managerId = userIdOf(req);

    if (!validId(requestId) || !validId(managerId)) {
      return fail(res, 400, "Invalid request or Manager ID");
    }

    const remarks = text(req.body?.remarks ?? req.body?.managerRemarks);

    if (remarks.length < 5 || remarks.length > 1000) {
      return fail(
        res,
        400,
        "Rejection reason must contain 5 to 1000 characters",
      );
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const request = await MaterialRequest.findById(requestId);

      if (!request) {
        return fail(res, 404, "Material request not found");
      }

      if (request.requestSource !== TECHNICIAN) {
        return fail(res, 409, "Only Technician requests can be rejected here");
      }

      if (request.managerApprovalStatus !== "PENDING") {
        return fail(res, 409, "Request has already been reviewed");
      }

      if (hasStoreActivity(request)) {
        return fail(
          res,
          409,
          "Cannot reject a request already processed by Store",
        );
      }

      const version = request.__v || 0;
      const now = new Date();

      const result = await MaterialRequest.updateOne(
        {
          _id: request._id,
          __v: version,
          managerApprovalStatus: "PENDING",
        },
        {
          $set: {
            managerApprovalStatus: "REJECTED",
            managerApprovedBy: null,
            managerApprovedAt: null,
            managerRejectedAt: now,
            managerRemarks: remarks,
            status: "REJECTED",
            "materials.$[].managerApprovedQuantity": 0,
            updatedAt: now,
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
        const updatedRequest = await populateRequests(
          MaterialRequest.findById(requestId),
        );

        return res.status(200).json({
          success: true,
          message: "Technician material request rejected",
          request: updatedRequest,
        });
      }
    }

    return fail(
      res,
      409,
      "Request changed by another user. Refresh and try again.",
    );
  } catch (error) {
    console.error("MANAGER REJECT REQUEST ERROR:", error);

    return fail(res, 500, "Unable to reject Technician material request");
  }
};

// ==========================================
// DELETE MATERIAL REQUEST
//
// Preserve existing route.
//
// A Technician's pending request is NOT
// physically deleted: reject with audit.
// Existing Manager-created pending requests
// may use the legacy delete behavior.
// ==========================================

exports.deleteMaterialRequest = async (req, res) => {
  try {
    if (!isManager(req)) {
      return fail(res, 403, "Maintenance Manager access only");
    }

    const requestId = req.params.id;

    if (!validId(requestId)) {
      return fail(res, 400, "Invalid material request ID");
    }

    const request = await MaterialRequest.findById(requestId);

    if (!request) {
      return fail(res, 404, "Material request not found");
    }

    // Technician requests must not be deleted,
    // because approval/rejection history matters.

    if (request.requestSource === TECHNICIAN) {
      return fail(
        res,
        409,
        "Technician requests must be approved or rejected, not deleted",
      );
    }

    if (request.status !== "PENDING" || hasStoreActivity(request)) {
      return fail(
        res,
        409,
        "Only unprocessed pending Manager requests can be deleted",
      );
    }

    const deleted = await MaterialRequest.findOneAndDelete({
      _id: requestId,
      status: "PENDING",
      __v: request.__v || 0,
    });

    if (!deleted) {
      return fail(res, 409, "Request was updated. Refresh and try again.");
    }

    return res.status(200).json({
      success: true,
      message: "Unprocessed Manager request deleted successfully",
    });
  } catch (error) {
    console.error("DELETE MATERIAL REQUEST ERROR:", error);

    return fail(res, 500, "Unable to delete material request");
  }
};
