const ReopenComplaint = require("../../models/ReopenComplaint");

const Complaint = require("../../models/Complaint");

const JobCard = require("../../models/JobCard");

const User = require("../../models/User");

// ==========================================
// GET ALL REOPEN COMPLAINTS
// ==========================================

exports.getAllReopenComplaints = async (req, res) => {
  try {
    const reopenComplaints = await ReopenComplaint.find()

      .populate({
        path: "complaint",

        select: `
              complaintId
              title
              category
              hostel
              roomNumber
              status
            `,
      })

      .populate({
        path: "jobCard",

        select: `
              jobCardId
              status
              workerStatus
            `,
      })

      .populate({
        path: "previousWorker",

        select: `
              name
              department
              employeeId
              phone
            `,
      })

      .populate({
        path: "reassignedWorker",

        select: `
              name
              department
              employeeId
              phone
            `,
      })

      .sort({
        createdAt: -1,
      });

    return res.status(200).json({
      success: true,

      count: reopenComplaints.length,

      reopenComplaints,
    });
  } catch (error) {
    console.log("GET REOPEN COMPLAINTS ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to fetch reopen complaints",
    });
  }
};

// ==========================================
// CREATE REOPEN COMPLAINT
// ==========================================

exports.createReopenComplaint = async (req, res) => {
  try {
    const {
      complaintId,

      reopenReason,

      priority,

      managerNotes,
    } = req.body;

    // ======================================
    // VALIDATION
    // ======================================

    if (!complaintId || !reopenReason) {
      return res.status(400).json({
        success: false,

        message: "Complaint ID and reopen reason are required",
      });
    }

    // ======================================
    // FIND COMPLAINT
    // ======================================

    const complaint = await Complaint.findById(complaintId);

    if (!complaint) {
      return res.status(404).json({
        success: false,

        message: "Complaint not found",
      });
    }

    // ======================================
    // FIND JOBCARD
    // ======================================

    const jobCard = await JobCard.findOne({
      complaint: complaint._id,
    });

    if (!jobCard) {
      return res.status(404).json({
        success: false,

        message: "Job card not found",
      });
    }

    // ======================================
    // UPDATE COMPLAINT
    // ======================================

    complaint.status = "REOPENED";

    complaint.reopenCount = (complaint.reopenCount || 0) + 1;

    complaint.reopenReason = reopenReason;

    await complaint.save();

    // ======================================
    // UPDATE JOB CARD
    // ======================================

    jobCard.status = "IN_PROGRESS";

    jobCard.workerStatus = "WORKING";

    await jobCard.save();

    // ======================================
    // CREATE REOPEN CASE
    // ======================================

    const reopenComplaint = await ReopenComplaint.create({
      reopenId: `REOPEN-${Date.now()}`,

      complaint: complaint._id,

      jobCard: jobCard._id,

      previousWorker: complaint.assignedTo,

      reopenReason,

      reopenCount: complaint.reopenCount,

      priority: priority || "MEDIUM",

      managerNotes: managerNotes || "",

      status: complaint.reopenCount >= 3 ? "ESCALATED" : "IN_PROGRESS",

      reopenedAt: new Date(),
    });

    return res.status(201).json({
      success: true,

      message: "Complaint reopened successfully",

      reopenComplaint,
    });
  } catch (error) {
    console.log("CREATE REOPEN COMPLAINT ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to reopen complaint",
    });
  }
};

// ==========================================
// REASSIGN WORKER
// ==========================================

exports.reassignWorker = async (req, res) => {
  try {
    const { id } = req.params;

    const { workerId } = req.body;

    // ======================================
    // VALIDATION
    // ======================================

    if (!workerId) {
      return res.status(400).json({
        success: false,

        message: "Worker ID is required",
      });
    }

    // ======================================
    // FIND REOPEN CASE
    // ======================================

    const reopenComplaint = await ReopenComplaint.findById(id);

    if (!reopenComplaint) {
      return res.status(404).json({
        success: false,

        message: "Reopen complaint not found",
      });
    }

    // ======================================
    // FIND WORKER
    // ======================================

    const worker = await User.findOne({
      _id: workerId,

      role: "WORKER",
    });

    if (!worker) {
      return res.status(404).json({
        success: false,

        message: "Worker not found",
      });
    }

    // ======================================
    // UPDATE REOPEN CASE
    // ======================================

    reopenComplaint.reassignedWorker = workerId;

    reopenComplaint.status = "REASSIGNED";

    await reopenComplaint.save();

    // ======================================
    // UPDATE COMPLAINT
    // ======================================

    const complaint = await Complaint.findById(reopenComplaint.complaint);

    if (complaint) {
      complaint.assignedTo = workerId;

      complaint.status = "IN_PROGRESS";

      await complaint.save();
    }

    // ======================================
    // UPDATE JOB CARD
    // ======================================

    const jobCard = await JobCard.findById(reopenComplaint.jobCard);

    if (jobCard) {
      jobCard.assignedWorker = workerId;

      jobCard.status = "IN_PROGRESS";

      jobCard.workerStatus = "WORKING";

      await jobCard.save();
    }

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      message: "Worker reassigned successfully",
    });
  } catch (error) {
    console.log("REASSIGN WORKER ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to reassign worker",
    });
  }
};
