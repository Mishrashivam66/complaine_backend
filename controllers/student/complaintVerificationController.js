"use strict";

const mongoose = require("mongoose");

const Complaint = require("../../models/Complaint");
const User = require("../../models/User");

const sendNotification = require("../../utils/sendNotification");

// =====================================================
// STUDENT SATISFACTION VERIFICATION
//
// POST /api/student/complaints/:id/verify
//
// SATISFIED     -> RESOLVED
// NOT_SATISFIED -> REOPENED
// =====================================================

exports.verifyComplaintByStudent = async (req, res) => {
  try {
    const studentId = req.user?._id || req.user?.id;

    // ===============================================
    // AUTHENTICATION
    // ===============================================

    if (!studentId) {
      return res.status(401).json({
        success: false,
        message: "Login required",
      });
    }

    if (String(req.user?.role || "").toUpperCase() !== "STUDENT") {
      return res.status(403).json({
        success: false,
        message: "Student access only",
      });
    }

    // ===============================================
    // COMPLAINT ID VALIDATION
    // ===============================================

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complaint ID",
      });
    }

    // ===============================================
    // STUDENT DECISION
    // ===============================================

    const decision = String(req.body?.decision || "")
      .trim()
      .toUpperCase();

    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

    if (!["SATISFIED", "NOT_SATISFIED"].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: "Choose Satisfied or Not Satisfied",
      });
    }

    // Reason required only for Not Satisfied.
    if (
      decision === "NOT_SATISFIED" &&
      (reason.length < 5 || reason.length > 800)
    ) {
      return res.status(400).json({
        success: false,
        message: "Reason must contain 5 to 800 characters",
      });
    }

    // ===============================================
    // NEXT STATUS
    // ===============================================

    const nextStatus = decision === "SATISFIED" ? "RESOLVED" : "REOPENED";

    const now = new Date();

    // ===============================================
    // UPDATE DOCUMENT
    //
    // Only COMPLETED complaints can be verified.
    // Condition is applied atomically.
    // ===============================================

    const update = {
      $set: {
        status: nextStatus,

        "studentVerification.decision": decision,

        "studentVerification.reason":
          decision === "NOT_SATISFIED" ? reason : "",

        "studentVerification.verifiedAt": now,

        "studentVerification.verifiedBy": studentId,

        ...(decision === "NOT_SATISFIED" ? { reopenReason: reason } : {}),
      },

      $push: {
        statusHistory: {
          status: nextStatus,
          changedBy: studentId,
          changedAt: now,
        },
      },

      ...(decision === "NOT_SATISFIED"
        ? {
            $inc: {
              reopenCount: 1,
            },
          }
        : {}),
    };

    // ===============================================
    // OWNERSHIP + STATUS CHECK
    // ===============================================

    const complaint = await Complaint.findOneAndUpdate(
      {
        _id: req.params.id,

        status: "COMPLETED",

        $or: [{ createdBy: studentId }, { student: studentId }],
      },

      update,

      {
        new: true,
        runValidators: true,
      },
    );

    if (!complaint) {
      return res.status(409).json({
        success: false,
        message: "Only your own COMPLETED complaint can be verified.",
      });
    }

    // ===============================================
    // NOTIFICATION HELPER
    //
    // Complaint save must not depend on
    // notification delivery.
    // ===============================================

    const notificationData = {
      sender: studentId,

      relatedComplaint: complaint._id,
      relatedId: complaint._id,
      relatedModel: "Complaint",

      type: "STATUS_UPDATE",

      priority: decision === "NOT_SATISFIED" ? "HIGH" : "MEDIUM",
    };

    const jobs = [];

    const queueNotification = (data) => {
      jobs.push(Promise.resolve().then(() => sendNotification(data)));
    };

    // ===============================================
    // STUDENT NOTIFICATION
    // ===============================================

    queueNotification({
      ...notificationData,

      receiver: studentId,

      title:
        decision === "SATISFIED" ? "Complaint Resolved" : "Complaint Reopened",

      message:
        decision === "SATISFIED"
          ? `You confirmed satisfactory repair for ${complaint.complaintId}.`
          : `Your feedback for ${complaint.complaintId} has been received.`,

      actionUrl: "/complaints",
    });

    // ===============================================
    // NOT SATISFIED: MANAGER + TECHNICIAN
    // ===============================================

    if (decision === "NOT_SATISFIED") {
      let managers = [];

      try {
        managers = await User.find({
          role: "MAINTENANCE_MANAGER",

          isActive: {
            $ne: false,
          },
        }).select("_id");
      } catch (error) {
        console.error("MANAGER LOOKUP ERROR:", error.message);
      }

      for (const manager of managers) {
        queueNotification({
          ...notificationData,

          receiver: manager._id,

          title: "Student Not Satisfied - Rework Required",

          message: `${complaint.complaintId}: ${reason}`,

          actionUrl: "/maintenance/dashboard",
        });
      }

      if (complaint.assignedTo) {
        queueNotification({
          ...notificationData,

          receiver: complaint.assignedTo,

          title: "Complaint Reopened by Student",

          message: `${complaint.complaintId}: ${reason}`,

          actionUrl: "/technician/dashboard",
        });
      }
    }

    await Promise.allSettled(jobs);

    // ===============================================
    // RESPONSE
    // ===============================================

    return res.status(200).json({
      success: true,

      message:
        decision === "SATISFIED"
          ? "Thank you! Complaint marked as RESOLVED."
          : "Complaint reopened. Maintenance Manager has been notified.",

      complaint,
    });
  } catch (error) {
    console.error("STUDENT VERIFICATION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to record Student verification",
    });
  }
};
