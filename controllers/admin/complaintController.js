"use strict";

const crypto = require("crypto");
const mongoose = require("mongoose");

const Complaint = require("../../models/Complaint");
const ComplaintAnalytics = require("../../models/ComplaintAnalytics");
const User = require("../../models/User");
const sendNotification = require("../../utils/sendNotification");

const FINISHED = ["COMPLETED", "RESOLVED", "CLOSED"];

const actorId = (req) => req.user?._id || req.user?.id;

const actorRole = (req) => String(req.user?.role || "").toUpperCase();

const isManager = (req) =>
  ["ADMIN", "MAINTENANCE_MANAGER"].includes(actorRole(req));

const isSame = (a, b) => Boolean(a && b && String(a) === String(b));

// ==========================================
// ERROR HANDLER
// ==========================================

const handleError = (res, error) => {
  if (error?.name === "CastError" || error?.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: "Invalid complaint data",
    });
  }

  if (error?.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "Duplicate complaint identifier",
    });
  }

  console.error("COMPLAINT ERROR:", error);

  return res.status(500).json({
    success: false,
    message: "Complaint operation failed",
  });
};

// ==========================================
// GET COMPLAINT DOCUMENT
// ==========================================

const getRecord = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({
      success: false,
      message: "Invalid complaint ID",
    });
    return null;
  }

  const complaint = await Complaint.findById(req.params.id);

  if (!complaint) {
    res.status(404).json({
      success: false,
      message: "Complaint not found",
    });
    return null;
  }

  return complaint;
};

// ==========================================
// STATUS HISTORY
// ==========================================

const addHistory = (complaint, status, req) => {
  complaint.status = status;

  complaint.statusHistory.push({
    status,
    changedAt: new Date(),
    changedBy: actorId(req),
  });
};

// ==========================================
// ACCURATE COMPLAINT STATISTICS
// ==========================================

const getCounts = async () => {
  const [grouped, escalated, highPriority] = await Promise.all([
    Complaint.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]),

    Complaint.countDocuments({
      isEscalated: true,
    }),

    Complaint.countDocuments({
      priority: {
        $in: ["HIGH", "URGENT"],
      },
    }),
  ]);

  const byStatus = Object.fromEntries(
    grouped.map(({ _id, count }) => [_id || "UNKNOWN", count]),
  );

  const count = (...keys) =>
    keys.reduce((sum, key) => sum + (byStatus[key] || 0), 0);

  const total = grouped.reduce((sum, row) => sum + row.count, 0);

  const resolved = count(...FINISHED);

  const known = count(
    "PENDING",
    "ASSIGNED",
    "IN_PROGRESS",
    "WAITING_MATERIAL",
    "WAITING_FOR_MATERIAL",
    "REOPENED",
    ...FINISHED,
  );

  return {
    total,

    pending: count("PENDING"),

    assigned: count("ASSIGNED"),

    inProgress: count("IN_PROGRESS"),

    waitingMaterial: count("WAITING_MATERIAL", "WAITING_FOR_MATERIAL"),

    resolved,
    completed: resolved,

    verified: count("RESOLVED", "CLOSED"),

    closed: count("CLOSED"),

    reopened: count("REOPENED"),

    escalated,
    highPriority,

    other: Math.max(0, total - known),
  };
};

// ==========================================
// UPDATE ANALYTICS
// ==========================================

const updateAnalytics = async () => {
  try {
    const stats = await getCounts();

    await ComplaintAnalytics.create({
      total: stats.total,
      pending: stats.pending,
      assigned: stats.assigned,
      resolved: stats.resolved,
      reopened: stats.reopened,
      escalated: stats.escalated,
      closed: stats.closed,
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error("COMPLAINT ANALYTICS ERROR:", error);
  }
};

// ==========================================
// SEND NOTIFICATION
// ==========================================

const notify = async (user, title, message) => {
  if (!user) return;

  try {
    await sendNotification({
      user,
      title,
      message,
      type: "COMPLAINT",
    });
  } catch (error) {
    console.error("COMPLAINT NOTIFICATION ERROR:", error);
  }
};

// ==========================================
// CREATE COMPLAINT
// ==========================================

const createComplaint = async (req, res) => {
  try {
    const userId = actorId(req);

    const complaint = await Complaint.create({
      ...req.body,

      student: req.body?.student || userId,
      createdBy: userId,

      complaintId:
        `CMP-${Date.now().toString(36).toUpperCase()}-` +
        crypto.randomBytes(3).toString("hex").toUpperCase(),

      status: "PENDING",

      assignedTo: null,
      assignedBy: null,
      workerAssigned: false,

      statusHistory: [
        {
          status: "PENDING",
          changedAt: new Date(),
          changedBy: userId,
        },
      ],
    });

    await updateAnalytics();

    await notify(
      userId,
      "Complaint Submitted",
      `Complaint ${complaint.complaintId} created successfully`,
    );

    return res.status(201).json({
      success: true,
      message: "Complaint created successfully",
      complaint,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// GET ALL COMPLAINTS
// ==========================================

const getAllComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find()
      .populate("createdBy", "name email role")
      .populate("assignedTo", "name email role")
      .populate("assignedBy", "name email")
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: complaints.length,
      complaints,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// GET COMPLAINT BY ID
// ==========================================

const getComplaintById = async (req, res) => {
  try {
    const complaint = await getRecord(req, res);

    if (!complaint) return;

    if (
      !isManager(req) &&
      !isSame(complaint.createdBy, actorId(req)) &&
      !isSame(complaint.student, actorId(req)) &&
      !isSame(complaint.assignedTo, actorId(req))
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized for this complaint",
      });
    }

    await complaint.populate("createdBy", "name email role");

    await complaint.populate("assignedTo", "name email role");

    await complaint.populate("assignedBy", "name email");

    return res.json({
      success: true,
      complaint,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// GET MY COMPLAINTS
// ==========================================

const getMyComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({
      createdBy: actorId(req),
    }).sort({ createdAt: -1 });

    return res.json({
      success: true,
      complaints,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// ASSIGN TECHNICIAN
// ==========================================

const assignComplaint = async (req, res) => {
  try {
    const complaint = await getRecord(req, res);

    if (!complaint) return;

    const technicianId = req.body?.technicianId || req.body?.workerId;

    if (!mongoose.isValidObjectId(technicianId)) {
      return res.status(400).json({
        success: false,
        message: "Valid Technician is required",
      });
    }

    const technician =
      await User.findById(technicianId).select("role isActive");

    if (
      !technician ||
      !["TECHNICIAN", "WORKER"].includes(technician.role) ||
      technician.isActive === false
    ) {
      return res.status(400).json({
        success: false,
        message: "Choose an active Technician account",
      });
    }

    if (FINISHED.includes(complaint.status)) {
      return res.status(409).json({
        success: false,
        message: "Completed complaints cannot be assigned",
      });
    }

    complaint.assignedTo = technicianId;
    complaint.assignedBy = actorId(req);
    complaint.workerAssigned = true;

    if (!complaint.startedAt) {
      complaint.startedAt = new Date();
    }

    addHistory(complaint, "IN_PROGRESS", req);

    await complaint.save();
    await updateAnalytics();

    await notify(
      technicianId,
      "New Maintenance Assignment",
      `Complaint ${complaint.complaintId} assigned to you`,
    );

    return res.json({
      success: true,
      message: "Technician assigned; complaint is In Progress",
      complaint,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// MANAGER VERIFICATION
// ==========================================

const resolveComplaint = async (req, res) => {
  try {
    const complaint = await getRecord(req, res);

    if (!complaint) return;

    if (!complaint.assignedTo) {
      return res.status(409).json({
        success: false,
        message: "Assign a Technician before verification",
      });
    }

    if (FINISHED.includes(complaint.status)) {
      return res.status(409).json({
        success: false,
        message: "Complaint already verified",
      });
    }

    if (req.body?.workerRemarks !== undefined) {
      complaint.workerRemarks = String(req.body.workerRemarks).trim();
    }

    complaint.completedAt = complaint.completedAt || new Date();

    complaint.resolvedAt = new Date();

    addHistory(complaint, "RESOLVED", req);

    await complaint.save();
    await updateAnalytics();

    await notify(
      complaint.createdBy,
      "Complaint Verified",
      `Complaint ${complaint.complaintId} has been verified`,
    );

    return res.json({
      success: true,
      message: "Complaint verified successfully",
      complaint,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// ESCALATE COMPLAINT
// ==========================================

const escalateComplaint = async (req, res) => {
  try {
    const complaint = await getRecord(req, res);

    if (!complaint) return;

    const reason = String(req.body?.reason || "").trim();

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Escalation reason is required",
      });
    }

    complaint.isEscalated = true;
    complaint.escalationReason = reason;
    complaint.escalatedAt = new Date();

    await complaint.save();
    await updateAnalytics();

    return res.json({
      success: true,
      message: "Complaint escalated",
      complaint,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// NOT SATISFIED FEEDBACK
// SAME COMPLAINT ID
// ==========================================

const reopenComplaint = async (req, res) => {
  try {
    const complaint = await getRecord(req, res);

    if (!complaint) return;

    const userId = actorId(req);

    if (
      !isSame(complaint.createdBy, userId) &&
      !isSame(complaint.student, userId)
    ) {
      return res.status(403).json({
        success: false,
        message: "Only the complainant can submit dissatisfaction",
      });
    }

    if (!FINISHED.includes(complaint.status)) {
      return res.status(409).json({
        success: false,
        message: "Feedback is accepted after verification",
      });
    }

    const reason = String(req.body?.reason || "").trim();

    if (reason.length < 5) {
      return res.status(400).json({
        success: false,
        message: "Please provide a reason (minimum 5 characters)",
      });
    }

    complaint.reopenCount = (complaint.reopenCount || 0) + 1;

    complaint.reopenReason = reason;
    complaint.priority = "HIGH";

    complaint.isEscalated = true;
    complaint.escalationReason = reason;
    complaint.escalatedAt = new Date();

    addHistory(complaint, "PENDING", req);

    await complaint.save();
    await updateAnalytics();

    await notify(
      complaint.assignedBy,
      "Not Satisfied — High Priority",
      `Complaint ${complaint.complaintId}: ${reason}`,
    );

    return res.json({
      success: true,
      message:
        "Feedback recorded; complaint returned to Maintenance as HIGH priority",
      complaint,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// CLOSE COMPLAINT
// ==========================================

const closeComplaint = async (req, res) => {
  try {
    const complaint = await getRecord(req, res);

    if (!complaint) return;

    if (!FINISHED.includes(complaint.status)) {
      return res.status(409).json({
        success: false,
        message: "Verify the completed work before closing",
      });
    }

    if (complaint.status === "CLOSED") {
      return res.json({
        success: true,
        message: "Complaint already closed",
        complaint,
      });
    }

    complaint.closedAt = new Date();

    addHistory(complaint, "CLOSED", req);

    await complaint.save();
    await updateAnalytics();

    return res.json({
      success: true,
      message: "Complaint closed",
      complaint,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// GET COMPLAINT STATS
// ==========================================

const getComplaintStats = async (req, res) => {
  try {
    const stats = await getCounts();

    return res.json({
      success: true,
      stats,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  createComplaint,
  getAllComplaints,
  getComplaintById,
  getMyComplaints,
  assignComplaint,
  resolveComplaint,
  escalateComplaint,
  reopenComplaint,
  closeComplaint,
  getComplaintStats,
};
