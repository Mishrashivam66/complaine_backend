const Complaint = require("../../models/Complaint");

const User = require("../../models/User");

const JobCard = require("../../models/JobCard");

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
    // CHECK ALREADY ASSIGNED
    // ======================================

    if (complaint.assignedTo) {
      return res.status(400).json({
        success: false,

        message: "Worker already assigned",
      });
    }

    // ======================================
    // CATEGORY MATCH
    // ======================================

    const complaintCategory = complaint.category?.toLowerCase()?.trim();

    const workerDepartment = worker.department?.toLowerCase()?.trim();

    const validMatch =
      complaintCategory === workerDepartment ||
      (complaintCategory === "electricity" &&
        workerDepartment === "electrical") ||
      (complaintCategory === "electrical" &&
        workerDepartment === "electricity");

    if (!validMatch) {
      return res.status(400).json({
        success: false,

        message: "Worker department does not match complaint category",
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
    // UPDATE WORKER STATUS
    // ======================================

    worker.status = "BUSY";

    worker.currentJobs = (worker.currentJobs || 0) + 1;

    await worker.save();

    // ======================================
    // CHECK EXISTING JOBCARD
    // ======================================

    const existingJobCard = await JobCard.findOne({
      complaint: complaint._id,
    });

    // ======================================
    // CREATE / UPDATE JOBCARD
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
    } else {
      existingJobCard.assignedWorker = worker._id;

      existingJobCard.status = "IN_PROGRESS";

      existingJobCard.workerStatus = "WORKING";

      existingJobCard.startedAt = new Date();

      await existingJobCard.save();
    }

    // ======================================
    // SEND NOTIFICATION TO WORKER
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
    // SEND NOTIFICATION TO STUDENT
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

      message: "Failed to assign worker",
    });
  }
};
