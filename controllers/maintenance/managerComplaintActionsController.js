"use strict";

const mongoose = require("mongoose");

const Complaint = require("../../models/Complaint");
const User = require("../../models/User");

const ComplaintActionLog = require("../../models/ComplaintActionLog");

const sendNotification = require("../../utils/sendNotification");

const actorId = (req) => req.user?._id || req.user?.id;

// ==========================================
// ERROR HANDLER
// ==========================================

const errorReply = (res, error) => {
  console.error("MANAGER COMPLAINT ERROR:", error);

  return res.status(500).json({
    success: false,
    message: "Unable to process maintenance request",
  });
};

// ==========================================
// GET ACTIVE TECHNICIANS
// ==========================================

exports.getTechnicians = async (req, res) => {
  try {
    const technicians = await User.find({
      role: {
        $in: ["TECHNICIAN", "WORKER"],
      },

      isActive: {
        $ne: false,
      },
    })
      .select("_id name email employeeId role status currentJobs maxJobs")
      .sort({ name: 1 })
      .lean();

    return res.json({
      success: true,
      technicians,
    });
  } catch (error) {
    return errorReply(res, error);
  }
};

// ==========================================
// ASSIGN AVAILABLE TECHNICIAN
// REUSE EXISTING ASSIGNMENT LOGIC
// ==========================================

exports.assignAvailableTechnician = async (req, res) => {
  try {
    const id = req.body?.technicianId || req.body?.workerId;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Select a valid Technician",
      });
    }

    const tech = await User.findById(id).select("role status isActive");

    if (
      !tech ||
      !["TECHNICIAN", "WORKER"].includes(tech.role) ||
      tech.isActive === false
    ) {
      return res.status(400).json({
        success: false,
        message: "Technician is not active",
      });
    }

    if (tech.status === "ON_LEAVE") {
      return res.status(409).json({
        success: false,
        message: "Technician is on leave; select another Technician",
      });
    }

    // Existing backend already records assignment,
    // sets IN_PROGRESS and sends notification.

    return require("../../controllers/admin/complaintController").assignComplaint(
      req,
      res,
    );
  } catch (error) {
    return errorReply(res, error);
  }
};

// ==========================================
// GET MANAGER ACTION HISTORY
// ==========================================

exports.getActionHistory = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complaint ID",
      });
    }

    const complaint = await Complaint.exists({
      _id: req.params.id,
    });

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    const actions = await ComplaintActionLog.find({
      complaint: req.params.id,
    })
      .populate("performedBy", "name role")
      .populate("technician", "name")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      actions,
    });
  } catch (error) {
    return errorReply(res, error);
  }
};

// ==========================================
// VERIFY OR RETURN COMPLETED WORK
// ==========================================

async function updateVerification(req, res, mode) {
  try {
    const id = req.params.id;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complaint ID",
      });
    }

    const note = String(
      mode === "verify" ? req.body?.remarks || "" : req.body?.reason || "",
    ).trim();

    if (note.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Remarks cannot exceed 2000 characters",
      });
    }

    if (mode === "correction" && note.length < 5) {
      return res.status(400).json({
        success: false,
        message: "Correction reason must have at least 5 characters",
      });
    }

    const now = new Date();

    const toStatus = mode === "verify" ? "RESOLVED" : "IN_PROGRESS";

    // Prevent duplicate verification.
    // Only Technician-completed work is eligible.

    const changes = {
      $set:
        mode === "verify"
          ? {
              status: toStatus,
              resolvedAt: now,
            }
          : {
              status: toStatus,
              resolvedAt: null,
              completedAt: null,
            },

      $push: {
        statusHistory: {
          status: toStatus,
          changedAt: now,
          changedBy: actorId(req),
        },
      },
    };

    const complaint = await Complaint.findOneAndUpdate(
      {
        _id: id,

        status: "COMPLETED",

        assignedTo: {
          $ne: null,
        },
      },

      changes,

      {
        new: true,
        runValidators: true,
      },
    );

    if (!complaint) {
      return res.status(409).json({
        success: false,
        message:
          "Technician must submit completed work before Manager verification/correction",
      });
    }

    // ======================================
    // SAVE VERIFICATION AUDIT
    // ======================================

    try {
      await ComplaintActionLog.create({
        complaint: complaint._id,

        action: mode === "verify" ? "VERIFIED" : "RETURNED_FOR_CORRECTION",

        performedBy: actorId(req),

        technician: complaint.assignedTo,

        fromStatus: "COMPLETED",

        toStatus,

        remarks: note,
      });
    } catch (auditError) {
      console.error("MANAGER AUDIT ERROR:", auditError);

      return res.status(500).json({
        success: false,
        message:
          "Status changed but detailed audit save failed. Refresh before retrying.",
      });
    }

    // ======================================
    // NOTIFY RELEVANT USERS
    // ======================================

    const receivers =
      mode === "verify"
        ? [complaint.createdBy, complaint.student, complaint.assignedTo]
        : [complaint.assignedTo, complaint.createdBy, complaint.student];

    const uniqueReceivers = [...new Set(receivers.filter(Boolean).map(String))];

    await Promise.allSettled(
      uniqueReceivers.map((user) =>
        sendNotification({
          user,

          title: mode === "verify" ? "Work Verified" : "Correction Required",

          message:
            `Complaint ${complaint.complaintId}: ` +
            (mode === "verify"
              ? "Manager verified work"
              : "Work returned for correction"),

          type: "COMPLAINT",
        }),
      ),
    );

    return res.json({
      success: true,

      message:
        mode === "verify"
          ? "Work verified by Maintenance Manager"
          : "Work returned to Technician for correction",

      complaint,
    });
  } catch (error) {
    return errorReply(res, error);
  }
}

// ==========================================
// MANAGER VERIFICATION
// ==========================================

exports.verifyCompletion = (req, res) => updateVerification(req, res, "verify");

// ==========================================
// RETURN TO TECHNICIAN
// ==========================================

exports.returnForCorrection = (req, res) =>
  updateVerification(req, res, "correction");

// ==========================================
// CLOSE VERIFIED COMPLAINT ONLY
// ==========================================

exports.closeVerifiedComplaint = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complaint ID",
      });
    }

    const now = new Date();

    const complaint = await Complaint.findOneAndUpdate(
      {
        _id: req.params.id,

        status: "RESOLVED",

        resolvedAt: {
          $ne: null,
        },
      },

      {
        $set: {
          status: "CLOSED",
          closedAt: now,
        },

        $push: {
          statusHistory: {
            status: "CLOSED",
            changedAt: now,
            changedBy: actorId(req),
          },
        },
      },

      {
        new: true,
        runValidators: true,
      },
    );

    if (!complaint) {
      return res.status(409).json({
        success: false,
        message: "Only Manager-verified complaints can be closed",
      });
    }

    return res.json({
      success: true,
      message: "Verified complaint closed",
      complaint,
    });
  } catch (error) {
    return errorReply(res, error);
  }
};

// ==========================================
// NOT SATISFIED ONLY AFTER VERIFICATION
// ==========================================

exports.notSatisfiedFeedback = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complaint ID",
      });
    }

    const complaint = await Complaint.findById(req.params.id).select("status");

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    if (!["RESOLVED", "CLOSED"].includes(complaint.status)) {
      return res.status(409).json({
        success: false,
        message:
          "Not Satisfied feedback is available after Manager verification",
      });
    }

    // Original controller validates ownership,
    // mandatory reason and HIGH priority.

    return require("../../controllers/admin/complaintController").reopenComplaint(
      req,
      res,
    );
  } catch (error) {
    return errorReply(res, error);
  }
};
