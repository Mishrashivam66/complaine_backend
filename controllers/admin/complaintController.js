const Complaint = require("../../models/Complaint");

const ComplaintAnalytics = require("../../models/ComplaintAnalytics");

const sendNotification = require("../../utils/sendNotification");

// ==========================================
// UPDATE ANALYTICS
// ==========================================

const updateAnalytics = async () => {
  try {
    const total = await Complaint.countDocuments();

    const pending = await Complaint.countDocuments({
      status: "PENDING",
    });

    const assigned = await Complaint.countDocuments({
      status: "ASSIGNED",
    });

    const resolved = await Complaint.countDocuments({
      status: "RESOLVED",
    });

    const reopened = await Complaint.countDocuments({
      status: "REOPENED",
    });

    const escalated = await Complaint.countDocuments({
      isEscalated: true,
    });

    const closed = await Complaint.countDocuments({
      status: "CLOSED",
    });

    await ComplaintAnalytics.create({
      total,

      pending,

      assigned,

      resolved,

      reopened,

      escalated,

      closed,

      generatedAt: new Date(),
    });
  } catch (error) {
    console.log("Analytics Error:", error);
  }
};

// ==========================================
// CREATE COMPLAINT
// ==========================================

const createComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.create({
      ...req.body,

      createdBy: req.user.id,

      complaintId: "CMP-" + Date.now().toString().slice(-6),

      status: "PENDING",

      statusHistory: [
        {
          status: "PENDING",

          changedAt: new Date(),

          changedBy: req.user.id,
        },
      ],
    });

    await updateAnalytics();

    await sendNotification({
      user: req.user.id,

      title: "Complaint Submitted",

      message: `Complaint ${complaint.complaintId} created successfully`,

      type: "COMPLAINT",
    });

    res.status(201).json({
      success: true,

      message: "Complaint created successfully",

      complaint,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
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

      .sort({
        createdAt: -1,
      });

    res.status(200).json({
      success: true,

      count: complaints.length,

      complaints,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// GET SINGLE COMPLAINT
// ==========================================

const getComplaintById = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id)

      .populate("createdBy", "name email role")

      .populate("assignedTo", "name email role")

      .populate("assignedBy", "name email");

    if (!complaint) {
      return res.status(404).json({
        success: false,

        message: "Complaint not found",
      });
    }

    res.status(200).json({
      success: true,

      complaint,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// GET MY COMPLAINTS
// ==========================================

const getMyComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({
      createdBy: req.user.id,
    })

      .sort({
        createdAt: -1,
      });

    res.status(200).json({
      success: true,

      complaints,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// ASSIGN COMPLAINT
// ==========================================

const assignComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({
        success: false,

        message: "Complaint not found",
      });
    }

    complaint.assignedTo = req.body.workerId;

    complaint.assignedBy = req.user.id;

    complaint.workerAssigned = true;

    complaint.status = "ASSIGNED";

    complaint.statusHistory.push({
      status: "ASSIGNED",

      changedAt: new Date(),

      changedBy: req.user.id,
    });

    await complaint.save();

    await updateAnalytics();

    res.status(200).json({
      success: true,

      message: "Worker assigned successfully",

      complaint,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// RESOLVE COMPLAINT
// ==========================================

const resolveComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({
        success: false,

        message: "Complaint not found",
      });
    }

    complaint.status = "RESOLVED";

    complaint.resolvedAt = new Date();

    complaint.workerRemarks = req.body.workerRemarks || "";

    complaint.statusHistory.push({
      status: "RESOLVED",

      changedAt: new Date(),

      changedBy: req.user.id,
    });

    await complaint.save();

    await updateAnalytics();

    res.status(200).json({
      success: true,

      message: "Complaint resolved successfully",

      complaint,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// ESCALATE COMPLAINT
// ==========================================

const escalateComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({
        success: false,

        message: "Complaint not found",
      });
    }

    complaint.isEscalated = true;

    complaint.escalationReason = req.body.reason;

    complaint.escalatedAt = new Date();

    await complaint.save();

    await updateAnalytics();

    res.status(200).json({
      success: true,

      message: "Complaint escalated successfully",

      complaint,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// REOPEN COMPLAINT
// ==========================================

const reopenComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({
        success: false,

        message: "Complaint not found",
      });
    }

    complaint.status = "REOPENED";

    complaint.reopenCount += 1;

    complaint.reopenReason = req.body.reason;

    complaint.statusHistory.push({
      status: "REOPENED",

      changedAt: new Date(),

      changedBy: req.user.id,
    });

    await complaint.save();

    await updateAnalytics();

    res.status(200).json({
      success: true,

      message: "Complaint reopened successfully",

      complaint,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// CLOSE COMPLAINT
// ==========================================

const closeComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({
        success: false,

        message: "Complaint not found",
      });
    }

    complaint.status = "CLOSED";

    complaint.closedAt = new Date();

    complaint.statusHistory.push({
      status: "CLOSED",

      changedAt: new Date(),

      changedBy: req.user.id,
    });

    await complaint.save();

    await updateAnalytics();

    res.status(200).json({
      success: true,

      message: "Complaint closed successfully",

      complaint,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// COMPLAINT STATS
// ==========================================

const getComplaintStats = async (req, res) => {
  try {
    const total = await Complaint.countDocuments();

    const pending = await Complaint.countDocuments({
      status: "PENDING",
    });

    const assigned = await Complaint.countDocuments({
      status: "ASSIGNED",
    });

    const resolved = await Complaint.countDocuments({
      status: "RESOLVED",
    });

    const reopened = await Complaint.countDocuments({
      status: "REOPENED",
    });

    const escalated = await Complaint.countDocuments({
      isEscalated: true,
    });

    const closed = await Complaint.countDocuments({
      status: "CLOSED",
    });

    res.status(200).json({
      success: true,

      stats: {
        total,
        pending,
        assigned,
        resolved,
        reopened,
        escalated,
        closed,
      },
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

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
