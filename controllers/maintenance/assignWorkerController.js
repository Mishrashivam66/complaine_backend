const Complaint = require("../../models/Complaint");

const User = require("../../models/User");

const JobCard = require("../../models/JobCard");
const Category = require("../../models/Category");
const sendNotification = require("../../utils/sendNotification");

// ==========================================
// GET ALL COMPLAINTS
// ==========================================

exports.getComplaintsForAssignment = async (req, res) => {
  try {
    // ======================================
    // FETCH COMPLAINTS
    // ======================================

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

    // ======================================
    // RESPONSE
    // ======================================

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
    // ======================================
    // FETCH WORKERS
    // ======================================

    const workers = await User.find({
      role: "WORKER",

      isActive: true,
    }).select(
      `
          name
          phone
          department
          shift
          status
          currentJobs
        `,
    );

    // ======================================
    // RESPONSE
    // ======================================

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

// ASSIGN WORKER

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
    // CATEGORY MATCH
    // ======================================

    // ======================================
    // CATEGORY MATCH
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
    const complaintCategory = complaint.category?.toLowerCase()?.trim();

    const workerDepartment = worker.department?.toLowerCase()?.trim();

    // ======================================
    // ACTIVE JOB COUNT
    // ======================================

    const activeJobs = await JobCard.countDocuments({
      assignedWorker: worker._id,

      status: {
        $in: ["ASSIGNED", "IN_PROGRESS", "MATERIAL_REQUIRED"],
      },
    });

    const MAX_JOBS = 10;

    if (activeJobs >= MAX_JOBS) {
      return res.status(400).json({
        success: false,
        message: "Worker already has maximum active complaints",
      });
    }

    // ======================================
    // UPDATE COMPLAINT
    // ======================================

    complaint.assignedTo = worker._id;

    complaint.assignedBy = req.user._id;

    complaint.workerAssigned = true;

    complaint.status = "IN_PROGRESS";

    complaint.startedAt = new Date();

    await complaint.save();

    // ======================================
    // CREATE / UPDATE JOBCARD
    // ======================================

    let existingJobCard = await JobCard.findOne({
      complaint: complaint._id,
    });

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
    } else {
      existingJobCard.assignedWorker = worker._id;

      existingJobCard.status = "IN_PROGRESS";

      existingJobCard.workerStatus = "WORKING";

      existingJobCard.startedAt = new Date();

      await existingJobCard.save();
    }

    // ======================================
    // WORKER STATUS
    // ======================================

    const updatedActiveJobs = activeJobs + 1;

    worker.status = updatedActiveJobs >= MAX_JOBS ? "BUSY" : "ACTIVE";

    await worker.save();

    // ======================================
    // NOTIFY WORKER
    // ======================================

    await sendNotification({
      receiver: worker._id,

      sender: req.user._id,

      title: "New Complaint Assigned",

      message: `Complaint ${complaint.complaintId} assigned to you`,

      type: "WORKER_ASSIGN",

      relatedComplaint: complaint._id,
    });

    // ======================================
    // NOTIFY STUDENT
    // ======================================

    await sendNotification({
      receiver: complaint.createdBy,

      sender: req.user._id,

      title: "Worker Assigned",

      message: "Maintenance worker assigned successfully",

      type: "STATUS_UPDATE",

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
      message: error.message,
    });
  }
};
