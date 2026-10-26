"use strict";

const Complaint = require("../../models/Complaint");

// ==========================================
// GET LOGGED-IN TECHNICIAN'S JOBS
// ==========================================

const getMyJobs = async (req, res) => {
  try {
    const technicianId = req.user?._id || req.user?.id;

    if (!technicianId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const complaints = await Complaint.find({
      assignedTo: technicianId,
    })
      .populate("createdBy", "name phone")
      .select(
        "complaintId title description " +
          "titleHindi descriptionHindi " +
          "status priority category complaintType " +
          "hostel block floor roomNumber " +
          "materialRequired materialStatus " +
          "createdAt startedAt completedAt " +
          "deadline assignedAt assignedTo",
      )
      .sort({
        createdAt: -1,
      })
      .lean();

    return res.status(200).json({
      success: true,
      count: complaints.length,
      complaints,
    });
  } catch (error) {
    console.error("TECHNICIAN MY JOBS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch assigned complaints",
    });
  }
};

module.exports = {
  getMyJobs,
};
