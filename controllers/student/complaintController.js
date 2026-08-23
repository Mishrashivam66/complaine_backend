const Complaint = require("../../models/Complaint");
const Category = require("../../models/Category");
const User = require("../../models/User");

const sendNotification = require("../../utils/sendNotification");

const translate = require("translate-google");

// ==========================================
// TECHNICAL TERMS
// ==========================================

const technicalTerms = {
  "Tube Light": "ट्यूब लाइट",
  "Switch Board": "स्विच बोर्ड",
  Fan: "पंखा",
  "LED Light": "एलईडी लाइट",
  Bulb: "बल्ब",
  AC: "एसी",
  Cooler: "कूलर",
  "Water Cooler": "वाटर कूलर",
  Tap: "नल",
  "Wash Basin": "वॉश बेसिन",
  "Door Lock": "दरवाज़े का ताला",
};

// ==========================================
// NOTIFICATION PRIORITY
//
// Complaint:
// LOW / MEDIUM / HIGH / URGENT
//
// Notification:
// LOW / MEDIUM / HIGH / CRITICAL
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
// SAFE SEND NOTIFICATION
//
// Notification fail hone par main
// complaint workflow fail nahi hoga
// ==========================================

const safeSendNotification = async (data) => {
  try {
    await sendNotification(data);
  } catch (error) {
    console.log("NOTIFICATION ERROR:", error.message);
  }
};

// ==========================================
// STATUS MESSAGE
// ==========================================

const getStatusNotification = (status, complaint) => {
  const complaintRef = complaint.complaintId || "Complaint";

  switch (String(status || "").toUpperCase()) {
    case "PENDING":
      return {
        title: "Complaint Pending",
        message: `${complaintRef} is currently pending.`,
      };

    case "ASSIGNED":
      return {
        title: "Worker Assigned",
        message: `A maintenance worker has been assigned to ${complaintRef}.`,
      };

    case "IN_PROGRESS":
      return {
        title: "Work In Progress",
        message: `Work has started on ${complaintRef}.`,
      };

    case "WAITING_MATERIAL":
      return {
        title: "Waiting for Material",
        message: `${complaintRef} is waiting for required material.`,
      };

    case "COMPLETED":
      return {
        title: "Work Completed",
        message: `Work for ${complaintRef} has been completed.`,
      };

    case "CLOSED":
      return {
        title: "Complaint Closed",
        message: `${complaintRef} has been closed successfully.`,
      };

    case "REOPENED":
      return {
        title: "Complaint Reopened",
        message: `${complaintRef} has been reopened.`,
      };

    default:
      return {
        title: "Complaint Updated",
        message: `${complaintRef} status has been updated to ${status}.`,
      };
  }
};

// ==========================================
// CREATE COMPLAINT
// ==========================================

const createComplaint = async (req, res) => {
  try {
    // ======================================
    // GET STUDENT
    // ======================================

    const student = await User.findById(req.user.id).select(
      `
          name
          role
          isHosteller
          hostel
          roomNumber
          block
          department
        `,
    );

    if (!student) {
      return res.status(404).json({
        success: false,

        message: "Student profile not found",
      });
    }

    // ======================================
    // HOSTELLER / DAY SCHOLAR
    // ======================================

    const isHosteller = student.isHosteller === true;

    const complaintArea = String(
      req.body.complaintArea || (isHosteller ? "HOSTEL" : "DEPARTMENT"),
    ).toUpperCase();

    // ======================================
    // DAY SCHOLAR RESTRICTION
    // ======================================

    if (!isHosteller && complaintArea !== "DEPARTMENT") {
      return res.status(403).json({
        success: false,

        message:
          "Day scholars can raise complaints only for their own department.",
      });
    }

    // ======================================
    // DAY SCHOLAR PROFILE VALIDATION
    // ======================================

    if (!isHosteller) {
      if (!student.department || !student.block) {
        return res.status(400).json({
          success: false,

          message:
            "Your department or block is not assigned. Please contact administrator.",
        });
      }
    }

    // ======================================
    // SAFE COMPLAINT DATA
    // ======================================

    const complaintData = {
      ...req.body,

      complaintArea,
    };

    // ======================================
    // DAY SCHOLAR
    // ======================================

    if (!isHosteller) {
      complaintData.complaintArea = "DEPARTMENT";

      complaintData.department = student.department;

      complaintData.block = student.block;

      complaintData.hostel = "";

      complaintData.roomNumber = "";

      delete complaintData.availableFrom;
      delete complaintData.availableTo;
    }

    // ======================================
    // HOSTELLER - HOSTEL COMPLAINT
    // ======================================
    else if (complaintArea === "HOSTEL") {
      complaintData.hostel = student.hostel;

      complaintData.roomNumber = student.roomNumber || "";

      complaintData.block = student.block || "";
    }

    // ======================================
    // HOSTELLER - DEPARTMENT COMPLAINT
    // ======================================
    else if (complaintArea === "DEPARTMENT") {
      complaintData.department = student.department;

      complaintData.block = student.block;

      delete complaintData.availableFrom;
      delete complaintData.availableTo;
    }

    // ======================================
    // CAMPUS COMPLAINT
    // ======================================
    else if (complaintArea === "CAMPUS") {
      delete complaintData.availableFrom;
      delete complaintData.availableTo;
    }

    // ======================================
    // AUTO TRANSLATE
    // ======================================

    let titleHindi = "";

    let descriptionHindi = "";

    try {
      if (complaintData.title) {
        titleHindi = await translate(complaintData.title, {
          to: "hi",
        });
      }

      if (complaintData.description) {
        descriptionHindi = await translate(complaintData.description, {
          to: "hi",
        });
      }
    } catch (error) {
      console.log("TRANSLATION ERROR:", error.message);
    }

    // ======================================
    // TECHNICAL TERM OVERRIDE
    // ======================================

    if (technicalTerms[complaintData.title]) {
      titleHindi = technicalTerms[complaintData.title];
    }

    // ======================================
    // 24 HOUR COMPLAINT DEADLINE
    // ======================================

    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // ======================================
    // CREATE COMPLAINT
    // ======================================

    const complaint = await Complaint.create({
      ...complaintData,

      titleHindi,

      descriptionHindi,

      status: "PENDING",

      createdBy: req.user.id,

      student: req.user.id,

      complaintId: "CMP-" + Date.now().toString().slice(-6),

      deadline,
    });

    // ======================================
    // STUDENT NOTIFICATION
    // ======================================

    await safeSendNotification({
      receiver: req.user.id,

      sender: req.user.id,

      title: "Complaint Submitted",

      message: `Your complaint "${complaint.subCategory || complaint.title || complaint.category}" has been submitted successfully.`,

      type: "COMPLAINT",

      priority: getNotificationPriority(complaint.priority),

      relatedComplaint: complaint._id,

      relatedId: complaint._id,

      relatedModel: "Complaint",

      actionUrl: "/dashboard",
    });

    // ======================================
    // MAINTENANCE MANAGER NOTIFICATIONS
    //
    // IMPORTANT:
    // Jab Department Verification module
    // complete hoga, is notification ko
    // CREATE time se hata kar
    // VERIFIED action par shift karenge.
    // ======================================

    const managers = await User.find({
      role: "MAINTENANCE_MANAGER",

      isActive: true,
    }).select("_id");

    if (managers.length > 0) {
      const managerNotifications = managers.map((manager) =>
        safeSendNotification({
          receiver: manager._id,

          sender: req.user.id,

          title: "New Complaint",

          message: `${student.name || "Student"} created complaint ${complaint.complaintId} for ${
            complaint.subCategory || complaint.title || complaint.category
          }.`,

          type: "COMPLAINT",

          priority: getNotificationPriority(complaint.priority),

          relatedComplaint: complaint._id,

          relatedId: complaint._id,

          relatedModel: "Complaint",

          actionUrl: "/maintenance/dashboard",
        }),
      );

      await Promise.allSettled(managerNotifications);
    }

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(201).json({
      success: true,

      message: "Complaint submitted successfully",

      complaint,
    });
  } catch (error) {
    console.log("CREATE COMPLAINT ERROR:", error);

    return res.status(500).json({
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

    return res.status(200).json({
      success: true,

      complaints,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
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

    return res.status(200).json({
      success: true,

      complaints,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
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

    return res.status(200).json({
      success: true,

      complaint,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
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

    const oldStatus = complaint.status;

    const newStatus = req.body.status || complaint.status;

    complaint.status = newStatus;

    complaint.remarks = req.body.remarks || complaint.remarks;

    // ======================================
    // CLOSED
    // ======================================

    if (newStatus === "CLOSED" && oldStatus !== "CLOSED") {
      complaint.closedAt = new Date();

      if (complaint.assignedTo) {
        const worker = await User.findById(complaint.assignedTo);

        if (worker) {
          worker.currentJobs = Math.max(0, (worker.currentJobs || 0) - 1);

          worker.status = worker.currentJobs >= 10 ? "BUSY" : "ACTIVE";

          await worker.save();
        }
      }
    }

    // ======================================
    // SAVE
    // ======================================

    await complaint.save();

    // ======================================
    // STUDENT STATUS NOTIFICATION
    // ======================================

    if (oldStatus !== complaint.status && complaint.createdBy) {
      const notification = getStatusNotification(complaint.status, complaint);

      await safeSendNotification({
        receiver: complaint.createdBy,

        sender: req.user._id,

        title: notification.title,

        message: notification.message,

        type: "STATUS_UPDATE",

        priority: getNotificationPriority(complaint.priority),

        relatedComplaint: complaint._id,

        relatedId: complaint._id,

        relatedModel: "Complaint",

        actionUrl: "/dashboard",
      });
    }

    // ======================================
    // NO SOCKET.IO
    // ======================================

    return res.status(200).json({
      success: true,

      message: "Complaint updated successfully",

      complaint,
    });
  } catch (error) {
    console.log("UPDATE COMPLAINT ERROR:", error);

    return res.status(500).json({
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
    // FIND WORKER
    // ======================================

    const worker = await User.findById(req.body.assignedTo);

    if (!worker) {
      return res.status(404).json({
        success: false,

        message: "Worker not found",
      });
    }

    // ======================================
    // MAX 10
    // ======================================

    if ((worker.currentJobs || 0) >= 10) {
      return res.status(400).json({
        success: false,

        message: "Worker already has 10 active complaints",
      });
    }

    // ======================================
    // ASSIGN WORKER
    // ======================================

    complaint.assignedTo = worker._id;

    complaint.status = "ASSIGNED";

    // ======================================
    // UPDATE WORKER
    // ======================================

    worker.currentJobs = (worker.currentJobs || 0) + 1;

    worker.status = worker.currentJobs >= 10 ? "BUSY" : "ACTIVE";

    await worker.save();

    // ======================================
    // SAVE COMPLAINT
    // ======================================

    await complaint.save();

    // ======================================
    // WORKER NOTIFICATION
    // ======================================

    await safeSendNotification({
      receiver: worker._id,

      sender: req.user._id,

      title: "New Complaint Assigned",

      message: `${complaint.complaintId} has been assigned to you.`,

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

    if (complaint.createdBy) {
      await safeSendNotification({
        receiver: complaint.createdBy,

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
    // NO SOCKET.IO
    // ======================================

    return res.status(200).json({
      success: true,

      message: "Complaint assigned successfully",

      complaint,
    });
  } catch (error) {
    console.log("ASSIGN COMPLAINT ERROR:", error);

    return res.status(500).json({
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

    complaint.reopenCount = (complaint.reopenCount || 0) + 1;

    complaint.reopenReason = req.body.reason || "";

    await complaint.save();

    // ======================================
    // STUDENT ACKNOWLEDGEMENT
    // ======================================

    if (complaint.createdBy) {
      await safeSendNotification({
        receiver: complaint.createdBy,

        sender: req.user._id,

        title: "Complaint Reopened",

        message: `Complaint ${complaint.complaintId} has been reopened successfully.`,

        type: "REOPEN",

        priority: getNotificationPriority(complaint.priority),

        relatedComplaint: complaint._id,

        relatedId: complaint._id,

        relatedModel: "Complaint",

        actionUrl: "/dashboard",
      });
    }

    // ======================================
    // ASSIGNED WORKER NOTIFICATION
    // ======================================

    if (complaint.assignedTo) {
      await safeSendNotification({
        receiver: complaint.assignedTo,

        sender: req.user._id,

        title: "Complaint Reopened",

        message: `${complaint.complaintId} has been reopened and requires attention.`,

        type: "REOPEN",

        priority: getNotificationPriority(complaint.priority),

        relatedComplaint: complaint._id,

        relatedId: complaint._id,

        relatedModel: "Complaint",

        actionUrl: "/dashboard",
      });
    }

    // ======================================
    // MAINTENANCE MANAGER NOTIFICATIONS
    // ======================================

    const managers = await User.find({
      role: "MAINTENANCE_MANAGER",

      isActive: true,
    }).select("_id");

    await Promise.allSettled(
      managers.map((manager) =>
        safeSendNotification({
          receiver: manager._id,

          sender: req.user._id,

          title: "Complaint Reopened",

          message: `${complaint.complaintId} has been reopened.`,

          type: "REOPEN",

          priority: getNotificationPriority(complaint.priority),

          relatedComplaint: complaint._id,

          relatedId: complaint._id,

          relatedModel: "Complaint",

          actionUrl: "/maintenance/dashboard",
        }),
      ),
    );

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      message: "Complaint reopened",

      complaint,
    });
  } catch (error) {
    console.log("REOPEN COMPLAINT ERROR:", error);

    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

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

    return res.status(200).json({
      success: true,

      categories,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// EXPORTS
// ==========================================

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
