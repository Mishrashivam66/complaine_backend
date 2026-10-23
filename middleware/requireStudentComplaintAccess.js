"use strict";

const StudentComplaintRestriction = require("../models/StudentComplaintRestriction");

// Apply to student complaint creation only.
// Do not block viewing past complaints.

module.exports = async function requireStudentComplaintAccess(req, res, next) {
  try {
    if (!req.user || req.user.role !== "STUDENT") {
      return res.status(403).json({
        success: false,
        message: "Only student accounts can submit student complaints",
      });
    }

    const restriction = await StudentComplaintRestriction.findOne({
      student: req.user._id,
      isBlocked: true,
    })
      .select("blockReason")
      .lean();

    if (restriction) {
      return res.status(403).json({
        success: false,
        code: "COMPLAINT_ACCESS_BLOCKED",

        message:
          "Your complaint submission access is blocked by Administration.",

        reason: restriction.blockReason,
      });
    }

    return next();
  } catch (error) {
    console.error("COMPLAINT ACCESS CHECK:", error);

    return res.status(503).json({
      success: false,
      message: "Complaint access could not be verified. Please try again.",
    });
  }
};
