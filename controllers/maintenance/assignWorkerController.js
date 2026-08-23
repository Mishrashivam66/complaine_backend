const Complaint = require("../../models/Complaint");

const User = require("../../models/User");

const Category = require("../../models/Category");

const JobCard = require("../../models/JobCard");

const sendNotification = require("../../utils/sendNotification");

// ==========================================
// MAX ACTIVE JOBS PER WORKER
// ==========================================

const MAX_JOBS = 10;

// ==========================================
// NOTIFICATION PRIORITY
// ==========================================

const getNotificationPriority = (priority) => {
  switch (String(priority || "").toUpperCase()) {
    case "URGENT":
      return "CRITICAL";

    case "HIGH":
      return "HIGH";

    case "MEDIUM":
      return "MEDIUM";

    default:
      return "LOW";
  }
};

// ==========================================
// SAFE NOTIFICATION
//
// Notification fail hone par main workflow
// fail nahi hoga
// ==========================================

const safeSendNotification = async (data) => {
  try {
    await sendNotification(data);
  } catch (error) {
    console.log("ASSIGN WORKER NOTIFICATION ERROR:", error.message);
  }
};

// ==========================================
// GET ALL COMPLAINTS
// ==========================================

exports.getComplaintsForAssignment = async (req, res) => {
  try {
    const complaints = await Complaint.find({
      status: {
        $in: ["PENDING", "ASSIGNED", "IN_PROGRESS"],
      },
    })
      .populate("createdBy", "name email phone hostel roomNumber")
      .populate("assignedTo", "name department phone")
      .sort({
        createdAt: -1,
      });

    return res.status(200).json({
      success: true,

      count: complaints.length,

      complaints,
    });
  } catch (error) {
    console.log("GET COMPLAINTS ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to fetch complaints",
    });
  }
};

// ==========================================
// GET ALL WORKERS
// ==========================================

exports.getWorkers = async (req, res) => {
  try {
    const workers = await User.find({
      role: "WORKER",

      isActive: true,
    }).select(`
      name
      phone
      department
      shift
      status
      currentJobs
    `);

    return res.status(200).json({
      success: true,

      count: workers.length,

      workers,
    });
  } catch (error) {
    console.log("GET WORKERS ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to fetch workers",
    });
  }
};

// ==========================================
// ASSIGN WORKER
// ==========================================

exports.assignWorker = async (req, res) => {
  try {
    const { complaintId, workerId } = req.body;

    // ======================================
    // VALIDATION
    // ======================================

    if (!complaintId || !workerId) {
      return res.status(400).json({
        success: false,

        message: "Complaint ID and Worker ID are required",
      });
    }

    // ======================================
    // FIND COMPLAINT
    // STUDENT CONTACT INCLUDED
    // ======================================

    const complaint = await Complaint.findById(complaintId).populate(
      "createdBy",
      "name email phone hostel roomNumber",
    );

    if (!complaint) {
      return res.status(404).json({
        success: false,

        message: "Complaint not found",
      });
    }

    // ======================================
    // FIND WORKER
    // ======================================

    const worker = await User.findOne({
      _id: workerId,

      role: "WORKER",

      isActive: true,
    });

    if (!worker) {
      return res.status(404).json({
        success: false,

        message: "Worker not found",
      });
    }

    // ======================================
    // ALREADY ASSIGNED
    // ======================================

    if (complaint.assignedTo) {
      return res.status(400).json({
        success: false,

        message: "Complaint already assigned",
      });
    }

    // ======================================
    // CATEGORY CONFIGURATION
    // ======================================

    const categoryData = await Category.findOne({
      categoryName: complaint.category,
    });

    if (!categoryData) {
      return res.status(400).json({
        success: false,

        message: "Category configuration not found",
      });
    }

    // ======================================
    // CATEGORY / DEPARTMENT MATCH
    // ======================================

    const complaintCategory = complaint.category?.toLowerCase()?.trim();

    const workerDepartment = worker.department?.toLowerCase()?.trim();

    if (complaintCategory !== workerDepartment) {
      return res.status(400).json({
        success: false,

        message: "Worker department does not match complaint category",
      });
    }

    // ======================================
    // ACTIVE JOB CARD LIMIT
    // ======================================

    const activeJobs = await JobCard.countDocuments({
      assignedWorker: worker._id,

      status: {
        $in: [
          "ASSIGNED",
          "IN_PROGRESS",
          "PARTIALLY_COMPLETED",
          "WAITING_MATERIAL",
        ],
      },

      isCompleted: false,
    });

    if (activeJobs >= MAX_JOBS) {
      return res.status(400).json({
        success: false,

        message: `Worker already has maximum ${MAX_JOBS} active Job Cards`,
      });
    }

    // ======================================
    // STUDENT CONTACT
    // ======================================

    const studentName = complaint.createdBy?.name || "";

    const studentPhone = complaint.createdBy?.phone || "";

    const studentId = complaint.createdBy?._id;

    // ======================================
    // ASSIGN WORKER
    // ======================================

    complaint.assignedTo = worker._id;

    complaint.assignedBy = req.user._id;

    complaint.workerAssigned = true;

    // ======================================
    // CURRENT FLOW
    //
    // Worker assign hone ke baad complaint
    // Assigned Jobs page par jayegi.
    // ======================================

    complaint.status = "IN_PROGRESS";

    complaint.startedAt = new Date();

    // ======================================
    // MATERIAL DECISION
    // ASSIGNED JOBS PAGE WILL HANDLE
    // ======================================

    complaint.materialDecision = "PENDING";

    complaint.materialRequired = false;

    await complaint.save();

    // ======================================
    // IMPORTANT
    //
    // JOBCARD YAHAN CREATE NAHI HOGA.
    //
    // Assigned Jobs
    //      ↓
    // Material YES / NO
    //      ↓
    // Ready
    //      ↓
    // Job Card Create
    // ======================================

    // ======================================
    // WORKER NOTIFICATION
    // ======================================

    await safeSendNotification({
      receiver: worker._id,

      sender: req.user._id,

      title: "New Complaint Assigned",

      message: `Complaint ${complaint.complaintId} (${complaint.title || complaint.subCategory || complaint.category}) has been assigned to you.`,

      type: "WORKER_ASSIGN",

      priority: getNotificationPriority(complaint.priority),

      relatedComplaint: complaint._id,

      relatedId: complaint._id,

      relatedModel: "Complaint",

      actionUrl: "/dashboard",
    });

    // ======================================
    // STUDENT NOTIFICATION
    // ======================================

    if (studentId) {
      await safeSendNotification({
        receiver: studentId,

        sender: req.user._id,

        title: "Worker Assigned",

        message: `${worker.name || "Maintenance worker"} has been assigned to your complaint ${complaint.complaintId}.`,

        type: "STATUS_UPDATE",

        priority: "MEDIUM",

        relatedComplaint: complaint._id,

        relatedId: complaint._id,

        relatedModel: "Complaint",

        actionUrl: "/dashboard",
      });
    }

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      message: "Worker assigned successfully",

      complaint: {
        _id: complaint._id,

        complaintId: complaint.complaintId,

        status: complaint.status,

        materialDecision: complaint.materialDecision,

        assignedTo: worker._id,
      },

      studentContact: {
        name: studentName,

        phone: studentPhone || "Not Provided",
      },
    });
  } catch (error) {
    console.log("ASSIGN WORKER ERROR:", error);

    console.log(error.stack);

    return res.status(500).json({
      success: false,

      message: error.message || "Failed to assign worker",
    });
  }
};

// ==========================================
// UPDATE MATERIAL DECISION
// ==========================================

exports.updateMaterialDecision = async (req, res) => {
  try {
    const { complaintId } = req.params;

    const { decision } = req.body;

    // ======================================
    // VALIDATION
    // ======================================

    if (!["REQUIRED", "NOT_REQUIRED"].includes(decision)) {
      return res.status(400).json({
        success: false,

        message: "Invalid material decision",
      });
    }

    // ======================================
    // FIND COMPLAINT
    // ======================================

    const complaint = await Complaint.findById(complaintId).populate(
      "assignedTo",
      "name phone department",
    );

    if (!complaint) {
      return res.status(404).json({
        success: false,

        message: "Complaint not found",
      });
    }

    // ======================================
    // MUST HAVE WORKER
    // ======================================

    if (!complaint.assignedTo) {
      return res.status(400).json({
        success: false,

        message: "Assign a worker before selecting material requirement",
      });
    }

    // ======================================
    // SAVE MATERIAL DECISION
    // ======================================

    complaint.materialDecision = decision;

    complaint.materialRequired = decision === "REQUIRED";

    await complaint.save();

    // ======================================
    // WORKER NOTIFICATION
    // ======================================

    if (complaint.assignedTo?._id) {
      await safeSendNotification({
        receiver: complaint.assignedTo._id,

        sender: req.user._id,

        title:
          decision === "REQUIRED"
            ? "Material Required"
            : "No Material Required",

        message:
          decision === "REQUIRED"
            ? `Material is required for complaint ${complaint.complaintId}.`
            : `Complaint ${complaint.complaintId} has been marked as not requiring material.`,

        type: decision === "REQUIRED" ? "MATERIAL" : "STATUS_UPDATE",

        priority: getNotificationPriority(complaint.priority),

        relatedComplaint: complaint._id,

        relatedId: complaint._id,

        relatedModel: "Complaint",

        actionUrl: "/dashboard",
      });
    }

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      message:
        decision === "REQUIRED" ? "Material required" : "Material not required",

      complaint,
    });
  } catch (error) {
    console.log("UPDATE MATERIAL DECISION ERROR:", error);

    return res.status(500).json({
      success: false,

      message: error.message || "Failed to update material decision",
    });
  }
};
