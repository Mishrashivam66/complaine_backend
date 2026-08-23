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
    // IMPORTANT:
    // STUDENT NAME + PHONE POPULATED
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
    // ACTIVE JOB COUNT
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
    // FIND EXISTING ACTIVE JOB CARD
    //
    // SAME:
    // HOSTEL
    // CATEGORY
    // WORKER
    //
    // MAXIMUM 10 COMPLAINTS
    // ======================================

    const existingJobCard = await JobCard.findOne({
      hostel: complaint.hostel || "",

      category: complaint.category,

      assignedWorker: worker._id,

      isCompleted: false,

      totalComplaints: {
        $lt: 10,
      },

      status: {
        $in: [
          "ASSIGNED",
          "IN_PROGRESS",
          "PARTIALLY_COMPLETED",
          "WAITING_MATERIAL",
        ],
      },
    });

    // ======================================
    // STUDENT CONTACT SNAPSHOT
    // ======================================

    const studentName = complaint.createdBy?.name || "";

    const studentPhone = complaint.createdBy?.phone || "";

    // ======================================
    // UPDATE COMPLAINT
    // ======================================

    complaint.assignedTo = worker._id;

    complaint.assignedBy = req.user._id;

    complaint.workerAssigned = true;

    complaint.status = "IN_PROGRESS";

    complaint.startedAt = new Date();

    // ======================================
    // MATERIAL DECISION
    // ======================================

    complaint.materialDecision = "PENDING";

    complaint.materialRequired = false;

    await complaint.save();

    // ======================================
    // CREATE NEW JOB CARD
    // ======================================

    if (!existingJobCard) {
      await JobCard.create({
        jobCardId: `JOB-${Date.now()}`,

        hostel: complaint.hostel || "",

        block: complaint.block || "",

        category: complaint.category,

        assignedWorker: worker._id,

        assignedBy: req.user._id,

        status: "IN_PROGRESS",

        workerStatus: "WORKING",

        startedAt: new Date(),

        totalComplaints: 1,

        complaints: [
          {
            serialNumber: 1,

            complaint: complaint._id,

            roomNumber: complaint.roomNumber || "",

            floor: complaint.floor || "",

            title: complaint.title || "",

            titleHindi: complaint.titleHindi || "",

            description: complaint.description || "",

            descriptionHindi: complaint.descriptionHindi || "",

            priority: complaint.priority || "MEDIUM",

            status: "ASSIGNED",

            startedAt: new Date(),

            // ==============================
            // STUDENT CONTACT
            // ==============================

            studentName,

            studentPhone,

            // ==============================
            // MATERIAL
            // ==============================

            materialRequired: complaint.materialRequired,
          },
        ],
      });
    } else {
      // ====================================
      // ADD TO EXISTING JOB CARD
      // ====================================

      existingJobCard.complaints.push({
        serialNumber: existingJobCard.complaints.length + 1,

        complaint: complaint._id,

        roomNumber: complaint.roomNumber || "",

        floor: complaint.floor || "",

        title: complaint.title || "",

        titleHindi: complaint.titleHindi || "",

        description: complaint.description || "",

        descriptionHindi: complaint.descriptionHindi || "",

        priority: complaint.priority || "MEDIUM",

        status: "ASSIGNED",

        startedAt: new Date(),

        // ================================
        // STUDENT CONTACT
        // ================================

        studentName,

        studentPhone,

        // ================================
        // MATERIAL
        // ================================

        materialRequired: complaint.materialRequired,
      });

      existingJobCard.totalComplaints = existingJobCard.complaints.length;

      existingJobCard.workerStatus = "WORKING";

      existingJobCard.status = "IN_PROGRESS";

      if (!existingJobCard.startedAt) {
        existingJobCard.startedAt = new Date();
      }

      await existingJobCard.save();
    }

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
    //
    // createdBy is populated now,
    // therefore use createdBy._id
    // ======================================

    const studentId = complaint.createdBy?._id;

    if (studentId) {
      await sendNotification({
        receiver: studentId,

        sender: req.user._id,

        title: "Worker Assigned",

        message: "Maintenance worker assigned successfully",

        type: "STATUS_UPDATE",

        relatedComplaint: complaint._id,
      });
    }

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      message: "Worker assigned successfully",

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

    const complaint = await Complaint.findById(complaintId);

    if (!complaint) {
      return res.status(404).json({
        success: false,

        message: "Complaint not found",
      });
    }

    // ======================================
    // MUST BE ASSIGNED FIRST
    // ======================================

    if (!complaint.assignedTo) {
      return res.status(400).json({
        success: false,

        message: "Assign a worker before selecting material requirement",
      });
    }

    // ======================================
    // SAVE DECISION
    // ======================================

    complaint.materialDecision = decision;

    complaint.materialRequired = decision === "REQUIRED";

    await complaint.save();

    // ======================================
    // UPDATE JOB CARD COMPLAINT SNAPSHOT
    // ======================================

    const jobCard = await JobCard.findOne({
      "complaints.complaint": complaint._id,

      isCompleted: false,
    });

    if (jobCard) {
      const item = jobCard.complaints.find(
        (entry) => String(entry.complaint) === String(complaint._id),
      );

      if (item) {
        item.materialRequired = complaint.materialRequired;

        await jobCard.save();
      }
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
