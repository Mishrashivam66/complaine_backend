const Complaint = require("../../models/Complaint");

const User = require("../../models/User");

const JobCard = require("../../models/JobCard");

const sendNotification = require("../../utils/sendNotification");

// ==========================================
// GET ALL COMPLAINTS FOR ASSIGNMENT
// ==========================================

exports.getComplaintsForAssignment = async (req, res) => {
  try {
    const complaints = await Complaint.find({
      status: {
        $in: ["PENDING", "ASSIGNED", "IN_PROGRESS"],
      },
    })

      .populate("createdBy", "name email")

      .populate("assignedTo", "name email")

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
    }).select("name email phone department shift status isActive");

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

// ==========================================
// ASSIGN WORKER
// ==========================================

exports.assignWorker = async (req, res) => {
  try {
    const {
      complaintId,

      workerId,
    } = req.body;

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
    // ======================================

    const complaint = await Complaint.findById(complaintId);

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
    });

    if (!worker) {
      return res.status(404).json({
        success: false,

        message: "Worker not found",
      });
    }

    // ======================================
    // CHECK OFFLINE
    // ======================================

    if (worker.status === "OFFLINE") {
      return res.status(400).json({
        success: false,

        message: "Worker is offline",
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
    // UPDATE COMPLAINT
    // ======================================

    complaint.assignedTo = worker._id;

    complaint.status = "IN_PROGRESS";

    complaint.workerAssigned = true;

    complaint.assignedBy = req.user._id;

    complaint.startedAt = new Date();

    // ======================================
    // UPDATE WORKER STATUS
    // ======================================

    worker.status = "BUSY";

    await worker.save();

    // ======================================
    // SAVE COMPLAINT
    // ======================================

    await complaint.save();

    // ======================================
    // CHECK JOB CARD
    // ======================================

    const existingJobCard = await JobCard.findOne({
      complaint: complaint._id,
    });

    // ======================================
    // CREATE JOB CARD
    // ======================================

    if (!existingJobCard) {
      await JobCard.create({
        jobCardId: `JOB-${Date.now()}`,

        complaint: complaint._id,

        assignedWorker: worker._id,

        assignedBy: req.user._id,

        status: "IN_PROGRESS",

        workerStatus: "WORKING",

        startedAt: new Date(),
      });
    }

    // ======================================
    // SEND NOTIFICATION
    // ======================================

    await sendNotification({
      receiver: worker._id,

      sender: req.user._id,

      title: "New Complaint Assigned",

      message: `You have been assigned complaint ${complaint.complaintId}`,

      type: "WORKER_ASSIGN",

      relatedComplaint: complaint._id,
    });

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      message: "Worker assigned successfully",
    });
  } catch (error) {
    console.log("ASSIGN WORKER ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to assign worker",
    });
  }
};

// ==========================================
// CREATE WORKER
// ==========================================

exports.createWorker = async (req, res) => {
  try {
    const { name, phone, category, shift } = req.body;

    // ======================================
    // VALIDATION
    // ======================================

    if (!name || !phone || !category) {
      return res.status(400).json({
        success: false,

        message: "Please fill all required fields",
      });
    }

    // ======================================
    // CHECK DUPLICATE
    // ======================================

    const existingWorker = await User.findOne({
      role: "WORKER",

      name: name.trim(),

      phone: phone.trim(),
    });

    if (existingWorker) {
      return res.status(400).json({
        success: false,

        message: "Worker already exists",
      });
    }

    // ======================================
    // AUTO EMAIL
    // ======================================

    const email = `worker${Date.now()}@amity.edu`;

    // ======================================
    // CREATE WORKER
    // ======================================

    const worker = await User.create({
      name,

      phone,

      email,

      password: "Worker@123",

      role: "WORKER",

      department: category,

      shift: shift || "DAY",

      status: "ACTIVE",

      designation: "Maintenance Worker",

      isApproved: true,

      isVerified: true,

      isActive: true,
    });

    return res.status(201).json({
      success: true,

      message: "Worker created successfully",

      worker,
    });
  } catch (error) {
    console.log("CREATE WORKER ERROR:", error);

    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// DELETE WORKER
// ==========================================

exports.deleteWorker = async (req, res) => {
  try {
    const { id } = req.params;

    const worker = await User.findById(id);

    if (!worker) {
      return res.status(404).json({
        success: false,

        message: "Worker not found",
      });
    }

    await User.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,

      message: "Worker deleted successfully",
    });
  } catch (error) {
    console.log("DELETE WORKER ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to delete worker",
    });
  }
};

// ==========================================
// UPDATE WORKER STATUS
// ==========================================

exports.updateWorkerStatus = async (req, res) => {
  try {
    const worker = await User.findById(req.params.id);

    if (!worker) {
      return res.status(404).json({
        success: false,

        message: "Worker not found",
      });
    }

    worker.status = req.body.status;

    await worker.save();

    return res.status(200).json({
      success: true,

      message: "Worker status updated successfully",

      worker,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,

      message: "Failed to update worker status",
    });
  }
};

// ==========================================
// UPDATE WORKER
// ==========================================

exports.updateWorker = async (req, res) => {
  try {
    const worker = await User.findById(req.params.id);

    if (!worker) {
      return res.status(404).json({
        success: false,

        message: "Worker not found",
      });
    }

    worker.name = req.body.name || worker.name;

    worker.phone = req.body.phone || worker.phone;

    worker.department = req.body.category || worker.department;

    worker.shift = req.body.shift || worker.shift;

    await worker.save();

    return res.status(200).json({
      success: true,

      message: "Worker updated successfully",

      worker,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,

      message: "Failed to update worker",
    });
  }
};
