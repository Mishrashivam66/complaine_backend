const mongoose = require("mongoose");

const ReopenComplaint = require("../../models/ReopenComplaint");
const Complaint = require("../../models/Complaint");
const JobCard = require("../../models/JobCard");
const User = require("../../models/User");
const sendNotification = require("../../utils/sendNotification");

// ==========================================
// HELPERS
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

const safeSendNotification = async (data) => {
  try {
    await sendNotification(data);
  } catch (error) {
    console.error("REOPEN NOTIFICATION ERROR:", error.message);
  }
};

const validId = (id) => mongoose.Types.ObjectId.isValid(id);

const sameId = (a, b) =>
  String(a?._id || a || "") === String(b?._id || b || "");

const hasSchemaField = (model, field) => Boolean(model.schema.path(field));

// ==========================================
// GET ALL REOPEN COMPLAINTS
// GET /api/maintenance/reopen-complaints
// ==========================================

exports.getAllReopenComplaints = async (req, res) => {
  try {
    let query = ReopenComplaint.find()
      .populate({
        path: "complaint",
        select:
          "complaintId title description category hostel block roomNumber status priority reopenReason assignedTo",
      })
      .populate({
        path: "previousWorker",
        select: "name department employeeId phone role",
      })
      .populate({
        path: "reassignedWorker",
        select: "name department employeeId phone role",
      })
      .sort({ createdAt: -1 });

    // Some deployments may have an optional Job Card field.
    if (hasSchemaField(ReopenComplaint, "jobCard")) {
      query = query.populate({
        path: "jobCard",
        select: "jobCardId status workerStatus",
      });
    }

    const reopenComplaints = await query;

    return res.status(200).json({
      success: true,
      count: reopenComplaints.length,
      reopenComplaints,
    });
  } catch (error) {
    console.error("GET REOPEN COMPLAINTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch reopen complaints",
    });
  }
};

// ==========================================
// CREATE REOPEN COMPLAINT
// POST /api/maintenance/reopen-complaints/create
// JOB CARD OPTIONAL
// ==========================================

exports.createReopenComplaint = async (req, res) => {
  try {
    const { complaintId, reopenReason } = req.body;

    const reason = typeof reopenReason === "string" ? reopenReason.trim() : "";

    if (!validId(complaintId) || !reason) {
      return res.status(400).json({
        success: false,
        message: "Valid Complaint ID and reopen reason are required",
      });
    }

    const complaint = await Complaint.findById(complaintId).populate(
      "createdBy",
      "name email phone",
    );

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    const role = String(req.user?.role || "")
      .trim()
      .toUpperCase();

    // Students may reopen only their own complaints.
    if (role === "STUDENT" && !sameId(complaint.createdBy, req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You cannot reopen another student's complaint",
      });
    }

    // Student NO is allowed after Technician Work Done.
    // Manager cannot submit Student feedback.
    if (role !== "STUDENT") {
      return res.status(403).json({
        success: false,
        message: "Only the Student can submit a not-satisfied response",
      });
    }

    if (
      !["COMPLETED", "AWAITING_STUDENT_CONFIRMATION"].includes(
        String(complaint.status).toUpperCase(),
      )
    ) {
      return res.status(409).json({
        success: false,
        message: "Complaint must be awaiting Student confirmation",
      });
    }

    // Prevent a duplicate active reopen case.
    const existingCase = await ReopenComplaint.findOne({
      complaint: complaint._id,
      status: {
        $in: ["IN_PROGRESS", "ESCALATED"],
      },
    });

    if (existingCase) {
      return res.status(409).json({
        success: false,
        message: "An active reopen case already exists",
      });
    }

    // ======================================
    // OPTIONAL JOB CARD
    // ======================================

    const jobCard = await JobCard.findOne({
      "complaints.complaint": complaint._id,
    });

    const previousWorker = complaint.assignedTo || null;

    const nextReopenCount = Number(complaint.reopenCount || 0) + 1;

    const isEscalated = nextReopenCount >= 3;

    const reopenedAt = new Date();

    // ======================================
    // CREATE REOPEN RECORD
    // ======================================

    const payload = {
      reopenId: `REOPEN-${Date.now()}-${String(complaint._id).slice(-5)}`,
      complaint: complaint._id,
      previousWorker,
      reopenReason: reason,
      reopenCount: nextReopenCount,
      priority: complaint.priority || "MEDIUM",
      status: isEscalated ? "ESCALATED" : "IN_PROGRESS",
      reopenedAt,
    };

    if (hasSchemaField(ReopenComplaint, "jobCard")) {
      payload.jobCard = jobCard?._id || null;
    }

    const reopenComplaint = await ReopenComplaint.create(payload);

    // ======================================
    // UPDATE ORIGINAL COMPLAINT
    // ======================================

    complaint.status = "REOPENED";
    complaint.reopenCount = nextReopenCount;
    complaint.reopenReason = reason;

    if (hasSchemaField(Complaint, "studentVerified")) {
      complaint.studentVerified = false;
    }

    await complaint.save();

    // ======================================
    // UPDATE JOB CARD ONLY IF IT EXISTS
    // ======================================

    if (jobCard) {
      jobCard.status = "IN_PROGRESS";
      jobCard.workerStatus = "WORKING";
      jobCard.isCompleted = false;
      jobCard.completedAt = null;

      const item = jobCard.complaints?.find((entry) =>
        sameId(entry.complaint, complaint._id),
      );

      if (item) {
        item.status = "IN_PROGRESS";
        item.completedAt = null;
      }

      await jobCard.save();
    }

    // ======================================
    // NOTIFY MAINTENANCE MANAGERS
    // ======================================

    const managers = await User.find({
      role: "MAINTENANCE_MANAGER",
      isActive: true,
    }).select("_id");

    const recipients = new Map();

    managers.forEach((manager) => {
      recipients.set(String(manager._id), manager._id);
    });

    // Notify previously assigned Technician as well.
    if (previousWorker) {
      recipients.set(String(previousWorker), previousWorker);
    }

    await Promise.allSettled(
      [...recipients.values()].map((receiver) =>
        safeSendNotification({
          receiver,
          sender: req.user._id,
          title: isEscalated ? "Complaint Escalated" : "Complaint Reopened",
          message:
            `Complaint ${complaint.complaintId} reopened. ` +
            `Student reason: ${reason}`,
          type: isEscalated ? "ESCALATION" : "REOPEN",
          priority: isEscalated
            ? "CRITICAL"
            : getNotificationPriority(complaint.priority),
          relatedComplaint: complaint._id,
          relatedId: reopenComplaint._id,
          relatedModel: "ReopenComplaint",
          actionUrl: "/maintenance/complaints",
        }),
      ),
    );

    return res.status(201).json({
      success: true,
      message: "Complaint reopened successfully",
      reopenComplaint,
    });
  } catch (error) {
    console.error("CREATE REOPEN COMPLAINT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to reopen complaint",
    });
  }
};

// ==========================================
// REASSIGN TECHNICIAN
// PUT /api/maintenance/reopen-complaints/reassign/:id
// ==========================================

exports.reassignWorker = async (req, res) => {
  try {
    const { id } = req.params;
    const { workerId } = req.body;

    if (!validId(id) || !validId(workerId)) {
      return res.status(400).json({
        success: false,
        message: "Valid case ID and Technician ID required",
      });
    }

    const reopenComplaint = await ReopenComplaint.findById(id);

    if (!reopenComplaint) {
      return res.status(404).json({
        success: false,
        message: "Reopen case not found",
      });
    }

    if (reopenComplaint.reassignedWorker) {
      return res.status(409).json({
        success: false,
        message: "This case is already reassigned",
      });
    }

    const worker = await User.findOne({
      _id: workerId,
      role: { $in: ["TECHNICIAN", "WORKER"] },
      isActive: true,
    });

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: "Active Technician not found",
      });
    }

    const complaint = await Complaint.findById(reopenComplaint.complaint);

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    if (
      String(worker.department || worker.category || "")
        .trim()
        .toUpperCase() !==
      String(complaint.category || "")
        .trim()
        .toUpperCase()
    ) {
      return res.status(400).json({
        success: false,
        message: "Technician category does not match complaint category",
      });
    }

    if (String(complaint.status).toUpperCase() !== "REOPENED") {
      return res.status(409).json({
        success: false,
        message: "Complaint is not in REOPENED state",
      });
    }

    reopenComplaint.reassignedWorker = worker._id;
    reopenComplaint.status = "REASSIGNED";

    await reopenComplaint.save();

    complaint.assignedTo = worker._id;
    complaint.status = "ASSIGNED";

    await complaint.save();

    // No Job Card required for reassignment.
    const jobCard = reopenComplaint.jobCard
      ? await JobCard.findById(reopenComplaint.jobCard)
      : null;

    if (jobCard) {
      jobCard.assignedWorker = worker._id;
      jobCard.status = "ASSIGNED";
      jobCard.workerStatus = "ASSIGNED";
      jobCard.isCompleted = false;
      jobCard.completedAt = null;

      const item = jobCard.complaints?.find((entry) =>
        sameId(entry.complaint, complaint._id),
      );

      if (item) {
        item.status = "ASSIGNED";
        item.completedAt = null;
      }

      await jobCard.save();
    }

    await safeSendNotification({
      receiver: worker._id,
      sender: req.user._id,
      title: "Reopened Complaint Assigned",
      message:
        `Complaint ${complaint.complaintId} ` +
        "has been assigned to you for rework.",
      type: "WORKER_ASSIGN",
      priority: getNotificationPriority(
        reopenComplaint.priority || complaint.priority,
      ),
      relatedComplaint: complaint._id,
      relatedId: reopenComplaint._id,
      relatedModel: "ReopenComplaint",
      actionUrl: "/dashboard",
    });

    return res.status(200).json({
      success: true,
      message: "Technician reassigned successfully",
      technician: {
        _id: worker._id,
        name: worker.name,
      },
    });
  } catch (error) {
    console.error("REASSIGN TECHNICIAN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to reassign Technician",
    });
  }
};
