const Complaint = require("../../models/Complaint");
const Category = require("../../models/Category");
const sendNotification = require("../../utils/sendNotification");

const User = require("../../models/User");

// ==========================================
// 24 HOUR DEADLINE
// ==========================================

const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);

// ==========================================
// CREATE COMPLAINT
// ==========================================

const createComplaint = async (req, res) => {
  try {
    // ======================================
    // CREATE COMPLAINT
    // ======================================

    const complaint = await Complaint.create({
      ...req.body,

      status: "PENDING",

      createdBy: req.user.id,

      student: req.user.id,

      complaintId: "CMP-" + Date.now().toString().slice(-6),

      deadline,
    });

    // ======================================
    // STUDENT NOTIFICATION
    // ======================================

    try {
      await sendNotification({
        receiver: req.user.id,

        sender: req.user.id,

        title: "Complaint Submitted",

        message: `Your complaint "${complaint.subCategory}" has been submitted successfully.`,

        type: "COMPLAINT",

        relatedComplaint: complaint._id,
      });
    } catch (notificationError) {
      console.log(
        "Notification Error:",

        notificationError.message,
      );
    }

    // ======================================
    // FIND MAINTENANCE MANAGERS
    // ======================================

    const managers = await User.find({
      role: "MAINTENANCE_MANAGER",
    });

    // ======================================
    // SEND TO MANAGERS
    // ======================================

    if (managers.length > 0) {
      for (const manager of managers) {
        if (!manager?._id) continue;

        await sendNotification({
          receiver: manager._id,

          sender: req.user.id,

          title: "New Complaint",

          message: `${req.user.name} created a new complaint for ${complaint.subCategory}`,

          type: "COMPLAINT",

          relatedComplaint: complaint._id,
        });
      }
    }

    // ======================================
    // RESPONSE
    // ======================================

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

      .populate("createdBy")

      .populate("assignedTo")

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
// GET MY COMPLAINTS
// ==========================================

// ==========================================
// GET MY COMPLAINTS
// ==========================================

const getMyComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({
      createdBy: req.user.id,
    })

      .populate(
        "assignedTo",

        `
            name
            email
            phone
            department
            status
            shift
          `,
      )

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
// GET SINGLE COMPLAINT
// ==========================================

const getComplaintById = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id)

      .populate("createdBy")

      .populate("assignedTo");

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
// UPDATE STATUS
// ==========================================

const updateComplaintStatus = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({
        success: false,

        message: "Complaint not found",
      });
    }

    complaint.status = req.body.status || complaint.status;

    complaint.remarks = req.body.remarks || complaint.remarks;

    if (req.body.status === "CLOSED") {
      complaint.closedAt = new Date();
    }

    await complaint.save();

    res.status(200).json({
      success: true,

      message: "Complaint updated successfully",

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

    // ======================================
    // ASSIGN WORKER
    // ======================================

    complaint.assignedTo = req.body.assignedTo;

    complaint.status = "ASSIGNED";

    // ======================================
    // UPDATE WORKER STATUS
    // ======================================

    const worker = await User.findById(req.body.assignedTo);

    if (worker) {
      worker.status = "BUSY";

      await worker.save();
    }

    // ======================================
    // SAVE COMPLAINT
    // ======================================

    await complaint.save();

    res.status(200).json({
      success: true,

      message: "Complaint assigned successfully",

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

    await complaint.save();

    res.status(200).json({
      success: true,

      message: "Complaint reopened",

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
// EXPORTS
// ==========================================

// ==========================================
// GET CATEGORIES FOR STUDENTS
// ==========================================

// ==========================================
// GET CATEGORIES FOR STUDENTS
// ==========================================

const getCategoriesForStudents = async (req, res) => {
  try {
    const categories = await Category.find({
      isActive: true,
    }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,

      categories,
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

  getMyComplaints,

  getComplaintById,

  updateComplaintStatus,

  assignComplaint,

  reopenComplaint,
  getCategoriesForStudents,
};
