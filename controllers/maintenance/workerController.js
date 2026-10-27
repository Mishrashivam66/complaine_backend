"use strict";

const mongoose = require("mongoose");
const Complaint = require("../../models/Complaint");
const User = require("../../models/User");
const Category = require("../../models/Category");
const JobCard = require("../../models/JobCard");
const sendNotification = require("../../utils/sendNotification");

const TECH_ROLES = ["TECHNICIAN", "WORKER"];
const SHIFTS = ["DAY", "NIGHT", "24x7"];
const MANAGED_STATUSES = ["ACTIVE", "OFFLINE", "ON_LEAVE"];
const CLOSED_STATUSES = ["RESOLVED", "CLOSED", "REJECTED", "CANCELLED"];

const upper = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const validId = (value) => mongoose.isValidObjectId(value);

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function fail(res, status, message) {
  return res.status(status).json({
    success: false,
    message,
  });
}

function outputUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    department: user.department,
    shift: user.shift,
    status: user.status,
    isActive: user.isActive,
    currentJobs: user.currentJobs,
    maxJobs: user.maxJobs,
  };
}

// ==========================================
// SHIFT CONFIGURATION
// ==========================================

function parseHHMM(raw, fallback) {
  const value = String(raw || fallback);
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);

  if (!match) {
    return parseHHMM(fallback, fallback);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    return parseHHMM(fallback, fallback);
  }

  return hours * 60 + minutes;
}

const SHIFT_WINDOWS = {
  DAY: {
    from: parseHHMM(process.env.TECH_DAY_START, "09:00"),
    to: parseHHMM(process.env.TECH_DAY_END, "17:00"),
  },

  NIGHT: {
    from: parseHHMM(process.env.TECH_NIGHT_START, "21:00"),
    to: parseHHMM(process.env.TECH_NIGHT_END, "05:00"),
  },
};

// ==========================================
// IST TIME
// ==========================================

function istMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return (
    Number(parts.find((part) => part.type === "hour")?.value || 0) * 60 +
    Number(parts.find((part) => part.type === "minute")?.value || 0)
  );
}

function inWindow(value, start, end) {
  return start < end
    ? value >= start && value < end
    : value >= start || value < end;
}

function isEmergency(complaint) {
  return (
    complaint?.isEmergency === true ||
    upper(complaint?.priority) === "EMERGENCY" ||
    upper(complaint?.complaintType) === "EMERGENCY"
  );
}

// ==========================================
// TECHNICIAN AVAILABILITY
// ==========================================

function availabilityOf(worker, complaint = null, date = new Date()) {
  if (worker.isDeleted === true || worker.isActive === false) {
    return {
      availability: "DISABLED",
      canScheduleAssignment: false,
      canAssignNow: false,
      canStartNow: false,
    };
  }

  if (worker.status === "ON_LEAVE" || worker.status === "OFFLINE") {
    return {
      availability: worker.status,
      canScheduleAssignment: false,
      canAssignNow: false,
      canStartNow: false,
    };
  }

  const window = SHIFT_WINDOWS[worker.shift];

  const onDuty = window
    ? inWindow(istMinutes(date), window.from, window.to)
    : false;

  const emergencyOnCall =
    worker.shift === "24x7" && complaint != null && isEmergency(complaint);

  return {
    availability:
      worker.shift === "24x7"
        ? "ON_CALL"
        : onDuty
          ? worker.status === "BUSY"
            ? "BUSY"
            : "ON_DUTY"
          : "OFF_DUTY",

    // Assignment means scheduling the job.
    // Off-duty Technician may receive assignment.
    // Legacy WORKER accounts cannot receive new jobs.
    canScheduleAssignment: worker.role === "TECHNICIAN",

    // Kept for compatibility with older consumers.
    canAssignNow: onDuty,

    // Actually beginning physical work is separate.
    canStartNow: onDuty || emergencyOnCall,
  };
}

const openAssignedFilter = (workerId) => ({
  assignedTo: workerId,

  status: {
    $nin: CLOSED_STATUSES,
  },
});

// ==========================================
// ADMIN-MANAGED CATEGORY LOOKUP
// ==========================================

async function activeCategory(name) {
  const trimmed = String(name ?? "").trim();

  if (!trimmed) return null;

  return Category.findOne({
    department: "MAINTENANCE",

    categoryName: new RegExp(`^\\s*${escapeRegex(trimmed)}\\s*$`, "i"),

    isActive: { $ne: false },
    isDeleted: { $ne: true },
  }).lean();
}

// ==========================================
// FIND TECHNICIAN
// ==========================================

async function findTechnician(id) {
  if (!validId(id)) return null;

  return User.findOne({
    _id: id,

    role: {
      $in: TECH_ROLES,
    },

    isDeleted: {
      $ne: true,
    },
  });
}

// ==========================================
// SAFE NOTIFICATION
// ==========================================

async function notifySafely(data) {
  try {
    await sendNotification(data);
  } catch (error) {
    console.error("MAINTENANCE NOTIFICATION ERROR:", error);
  }
}

// ==========================================
// GET ALL MAINTENANCE COMPLAINTS
// ==========================================

exports.getComplaintsForAssignment = async (_req, res) => {
  try {
    const complaints = await Complaint.find({})
      .populate("createdBy", "name email phone")
      .populate("assignedTo", "name email phone department shift")
      .sort({
        createdAt: -1,
      });

    return res.json({
      success: true,
      count: complaints.length,
      complaints,
    });
  } catch (error) {
    console.error("GET MAINTENANCE COMPLAINTS ERROR:", error);

    return fail(res, 500, "Failed to fetch complaints");
  }
};

// ==========================================
// GET TECHNICIANS
// ==========================================

exports.getWorkers = async (_req, res) => {
  try {
    const users = await User.find({
      role: {
        $in: TECH_ROLES,
      },

      isDeleted: {
        $ne: true,
      },
    })
      .select(
        "name email phone role department shift status isActive isDeleted currentJobs maxJobs",
      )
      .sort({
        name: 1,
      })
      .lean();

    const workers = users.map((user) => ({
      ...user,
      ...availabilityOf(user),
    }));

    return res.json({
      success: true,
      count: workers.length,
      workers,
    });
  } catch (error) {
    console.error("GET TECHNICIANS ERROR:", error);

    return fail(res, 500, "Failed to fetch Technicians");
  }
};

// ==========================================
// CREATE TECHNICIAN LOGIN ACCOUNT
// ==========================================

exports.createWorker = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      category,
      shift = "DAY",
    } = req.body || {};

    const cleanName = String(name || "").trim();

    const cleanEmail = String(email || "")
      .trim()
      .toLowerCase();

    const cleanPhone = String(phone || "").replace(/\s/g, "");

    if (
      !cleanName ||
      !cleanEmail ||
      !cleanPhone ||
      typeof password !== "string"
    ) {
      return fail(res, 400, "Name, email, phone and password are required");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return fail(res, 400, "Invalid email address");
    }

    if (!/^\+?\d{10,15}$/.test(cleanPhone)) {
      return fail(res, 400, "Invalid mobile number");
    }

    if (password.length < 8) {
      return fail(res, 400, "Password must contain at least 8 characters");
    }

    if (!SHIFTS.includes(shift)) {
      return fail(res, 400, "Invalid shift");
    }

    const categoryMaster = await activeCategory(category);

    if (!categoryMaster) {
      return fail(
        res,
        400,
        "Select an active Admin-created Maintenance category",
      );
    }

    if (
      await User.exists({
        email: cleanEmail,
      })
    ) {
      return fail(res, 409, "Email already registered");
    }

    const duplicatePhone = await User.exists({
      phone: cleanPhone,
      role: { $in: TECH_ROLES },
      isDeleted: { $ne: true },
    });

    if (duplicatePhone) {
      return fail(res, 409, "Technician mobile number already registered");
    }

    // User.js will hash the password.

    const technician = await User.create({
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      password,

      role: "TECHNICIAN",
      department: categoryMaster.categoryName,
      designation: "Maintenance Technician",

      shift,
      status: "ACTIVE",

      currentJobs: 0,
      maxJobs: 10,

      isActive: true,
      isDeleted: false,
      isApproved: true,

      // Staff onboarding by Manager.
      // Email ownership verification can
      // be added as a separate step.
      isVerified: true,
    });

    return res.status(201).json({
      success: true,
      accountCreated: true,
      loginCreated: true,

      message: "Technician account created successfully",

      worker: outputUser(technician),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return fail(res, 409, "Identifier already registered");
    }

    console.error("CREATE TECHNICIAN ERROR:", error);

    return fail(res, 500, "Failed to create Technician account");
  }
};

// ==========================================
// UPGRADE LEGACY WORKER LOGIN
// ==========================================

exports.activateLegacyTechnicianLogin = async (req, res) => {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();

    const password = req.body?.password;

    if (!validId(req.params.id)) {
      return fail(res, 400, "Invalid Worker ID");
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== "string" ||
      password.length < 8
    ) {
      return fail(
        res,
        400,
        "Valid email and password (8+ characters) required",
      );
    }

    const worker = await User.findOne({
      _id: req.params.id,
      role: "WORKER",
      isDeleted: { $ne: true },
    });

    if (!worker) {
      return fail(res, 404, "Legacy Worker not found");
    }

    if (
      await User.exists({
        email,
        _id: { $ne: worker._id },
      })
    ) {
      return fail(res, 409, "Email is already in use");
    }

    worker.email = email;
    worker.password = password;
    worker.role = "TECHNICIAN";
    worker.isVerified = true;
    worker.isApproved = true;
    worker.designation = "Maintenance Technician";

    await worker.save();

    return res.json({
      success: true,

      message: "Legacy Worker upgraded. Existing assignment IDs preserved.",

      worker: outputUser(worker),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return fail(res, 409, "Email already in use");
    }

    console.error("UPGRADE WORKER ERROR:", error);

    return fail(res, 500, "Failed to upgrade Worker");
  }
};

// ==========================================
// UPDATE TECHNICIAN
// ==========================================

exports.updateWorker = async (req, res) => {
  try {
    const technician = await findTechnician(req.params.id);

    if (!technician) {
      return fail(res, 404, "Technician not found");
    }

    const { name, phone, category, department, shift } = req.body || {};

    if (name !== undefined) {
      if (!String(name).trim()) {
        return fail(res, 400, "Name cannot be empty");
      }

      technician.name = String(name).trim();
    }

    if (phone !== undefined) {
      const cleanPhone = String(phone).replace(/\s/g, "");

      if (!/^\+?\d{10,15}$/.test(cleanPhone)) {
        return fail(res, 400, "Invalid mobile number");
      }

      const duplicatePhone = await User.exists({
        _id: { $ne: technician._id },
        phone: cleanPhone,
        role: { $in: TECH_ROLES },
        isDeleted: { $ne: true },
      });

      if (duplicatePhone) {
        return fail(res, 409, "Mobile number already in use");
      }

      technician.phone = cleanPhone;
    }

    if (category !== undefined || department !== undefined) {
      const master = await activeCategory(category ?? department);

      if (!master) {
        return fail(res, 400, "Select an active Admin-created category");
      }

      if (upper(technician.department) !== upper(master.categoryName)) {
        const openCount = await Complaint.countDocuments(
          openAssignedFilter(technician._id),
        );

        if (openCount) {
          return fail(
            res,
            409,
            "Complete/reassign active jobs before changing Technician category",
          );
        }
      }

      technician.department = master.categoryName;
    }

    if (shift !== undefined) {
      if (!SHIFTS.includes(shift)) {
        return fail(res, 400, "Invalid shift");
      }

      technician.shift = shift;
    }

    await technician.save();

    return res.json({
      success: true,
      message: "Technician updated",
      worker: outputUser(technician),
    });
  } catch (error) {
    console.error("UPDATE TECHNICIAN ERROR:", error);

    return fail(res, 500, "Failed to update Technician");
  }
};

// ==========================================
// UPDATE TECHNICIAN STATUS
// ==========================================

exports.updateWorkerStatus = async (req, res) => {
  try {
    const technician = await findTechnician(req.params.id);

    if (!technician) {
      return fail(res, 404, "Technician not found");
    }

    const status = upper(req.body?.status);

    if (!MANAGED_STATUSES.includes(status)) {
      return fail(res, 400, "Allowed statuses: ACTIVE, OFFLINE, ON_LEAVE");
    }

    if (technician.isActive === false && status === "ACTIVE") {
      return fail(res, 409, "Archived account cannot be activated");
    }

    technician.status = status;

    await technician.save();

    return res.json({
      success: true,

      message: "Technician status updated",

      worker: outputUser(technician),
    });
  } catch (error) {
    console.error("UPDATE TECHNICIAN STATUS ERROR:", error);

    return fail(res, 500, "Status update failed");
  }
};

// ==========================================
// ARCHIVE TECHNICIAN
// ==========================================

exports.deleteWorker = async (req, res) => {
  try {
    const technician = await findTechnician(req.params.id);

    if (!technician) {
      return fail(res, 404, "Technician not found");
    }

    const [openComplaints, openCards] = await Promise.all([
      Complaint.countDocuments(openAssignedFilter(technician._id)),

      JobCard.countDocuments({
        assignedWorker: technician._id,
        isCompleted: { $ne: true },
      }),
    ]);

    if (openComplaints || openCards) {
      return fail(
        res,
        409,
        "Reassign or finish open assignments before archiving Technician",
      );
    }

    technician.isActive = false;
    technician.isDeleted = true;
    technician.status = "OFFLINE";
    technician.deletedAt = new Date();

    technician.deletedBy = req.user?._id || req.user?.id || null;

    await technician.save();

    return res.json({
      success: true,

      message: "Technician archived; history preserved",
    });
  } catch (error) {
    console.error("ARCHIVE TECHNICIAN ERROR:", error);

    return fail(res, 500, "Failed to archive Technician");
  }
};

// ==========================================
// ASSIGN TECHNICIAN
// ASSIGNMENT IS SCHEDULING, NOT WORK START
// ==========================================

exports.assignWorker = async (req, res) => {
  try {
    const { complaintId, workerId } = req.body || {};

    if (!validId(complaintId) || !validId(workerId)) {
      return fail(res, 400, "Valid Complaint ID and Technician ID required");
    }

    const [complaint, technician] = await Promise.all([
      Complaint.findById(complaintId).populate("createdBy", "name phone email"),

      findTechnician(workerId),
    ]);

    if (!complaint) {
      return fail(res, 404, "Complaint not found");
    }

    if (!technician) {
      return fail(res, 404, "Technician not found");
    }

    if (technician.role !== "TECHNICIAN") {
      return fail(
        res,
        409,
        "Upgrade legacy Worker to secure Technician login before assigning new jobs",
      );
    }

    if (complaint.assignedTo || complaint.workerAssigned === true) {
      return fail(res, 409, "Complaint already assigned");
    }

    if (!["PENDING", "REOPENED"].includes(upper(complaint.status))) {
      return fail(res, 409, "Complaint is not eligible for assignment");
    }

    // Validate category from Admin Master.

    const master = await activeCategory(complaint.category);

    if (!master) {
      return fail(
        res,
        409,
        `Complaint category '${complaint.category}' is not active in Admin Master. Review legacy category data.`,
      );
    }

    if (upper(technician.department) !== upper(master.categoryName)) {
      return fail(
        res,
        409,
        `Category mismatch: complaint '${master.categoryName}' vs Technician '${technician.department}'`,
      );
    }

    // Off-duty assignment is allowed.
    // Disabled, offline and leave are blocked.

    const duty = availabilityOf(technician, complaint);

    if (!duty.canScheduleAssignment) {
      return fail(
        res,
        409,
        `Technician cannot be assigned: ${duty.availability}`,
      );
    }

    // Maximum open complaints per Technician.

    const openJobs = await Complaint.countDocuments(
      openAssignedFilter(technician._id),
    );

    const maxJobs = Number.isInteger(technician.maxJobs)
      ? technician.maxJobs
      : 10;

    if (openJobs >= maxJobs) {
      return fail(res, 409, "Technician has reached maximum open jobs");
    }

    // Check schema compatibility.

    const statuses = Complaint.schema.path("status")?.enumValues || [];

    if (statuses.length && !statuses.includes("ASSIGNED")) {
      return fail(
        res,
        500,
        "Complaint schema status enum is missing ASSIGNED. Add it before using scheduled assignment.",
      );
    }

    // Atomic single-complaint assignment.

    const assigned = await Complaint.findOneAndUpdate(
      {
        _id: complaint._id,

        status: complaint.status,

        assignedTo: null,

        workerAssigned: {
          $ne: true,
        },
      },
      {
        $set: {
          assignedTo: technician._id,

          assignedBy: req.user?._id || req.user?.id,

          workerAssigned: true,

          status: "ASSIGNED",

          // startedAt is NOT set here.
        },
      },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!assigned) {
      return fail(res, 409, "Complaint changed; refresh and retry");
    }

    // Normal complaints remain digital.
    // No automatic physical JobCard here.
    // Material decision/history are preserved.

    await notifySafely({
      receiver: technician._id,

      sender: req.user?._id || req.user?.id,

      title: "New Maintenance Job Assigned",

      message: `Complaint ${assigned.complaintId} is assigned. Start work during eligible duty.`,

      type: "WORKER_ASSIGN",

      relatedComplaint: assigned._id,

      actionUrl: "/technician/dashboard",
    });

    if (complaint.createdBy?._id) {
      await notifySafely({
        receiver: complaint.createdBy._id,

        sender: req.user?._id || req.user?.id,

        title: "Technician Assigned",

        message: `${technician.name} has been assigned complaint ${assigned.complaintId}.`,

        type: "STATUS_UPDATE",

        relatedComplaint: assigned._id,

        actionUrl: "/dashboard",
      });
    }

    return res.json({
      success: true,

      message: "Technician assigned; job scheduled for duty",

      complaint: {
        _id: assigned._id,

        complaintId: assigned.complaintId,

        assignedTo: technician._id,

        status: "ASSIGNED",

        materialDecision: assigned.materialDecision,

        materialRequired: assigned.materialRequired,
      },

      technician: {
        _id: technician._id,
        name: technician.name,

        availability: duty.availability,

        canStartNow: duty.canStartNow,
      },
    });
  } catch (error) {
    console.error("ASSIGN TECHNICIAN ERROR:", error);

    if (error?.name === "ValidationError") {
      return fail(res, 400, error.message);
    }

    return fail(res, 500, "Failed to assign Technician");
  }
};

// ==========================================
// TECHNICIAN STARTS OWN ASSIGNED WORK
// ==========================================

exports.startMyWork = async (req, res) => {
  try {
    const technicianId = req.user?._id || req.user?.id;

    const complaintId = req.params.complaintId;

    if (!validId(technicianId) || !validId(complaintId)) {
      return fail(res, 400, "Invalid Technician or Complaint ID");
    }

    const technician = await User.findOne({
      _id: technicianId,

      role: "TECHNICIAN",

      isActive: {
        $ne: false,
      },

      isDeleted: {
        $ne: true,
      },
    });

    if (!technician) {
      return fail(res, 403, "Active Technician account required");
    }

    const complaint = await Complaint.findOne({
      _id: complaintId,

      assignedTo: technician._id,
    });

    if (!complaint) {
      return fail(res, 404, "Job not assigned to your account");
    }

    if (upper(complaint.status) !== "ASSIGNED") {
      return fail(res, 409, "Only ASSIGNED jobs can be started");
    }

    const duty = availabilityOf(technician, complaint);

    if (!duty.canStartNow) {
      return fail(
        res,
        409,
        `Cannot start job during ${duty.availability}. Wait for your duty, or contact Maintenance Manager.`,
      );
    }

    const startedAt = new Date();

    const started = await Complaint.findOneAndUpdate(
      {
        _id: complaint._id,

        assignedTo: technician._id,

        status: "ASSIGNED",
      },
      {
        $set: {
          status: "IN_PROGRESS",
          startedAt,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!started) {
      return fail(res, 409, "Job status changed; refresh and retry");
    }

    if (technician.status === "ACTIVE") {
      await User.updateOne(
        {
          _id: technician._id,

          status: "ACTIVE",
        },
        {
          $set: {
            status: "BUSY",
          },
        },
      );
    }

    return res.json({
      success: true,

      message: "Work started successfully",

      complaint: {
        _id: started._id,

        complaintId: started.complaintId,

        status: started.status,

        startedAt: started.startedAt,
      },
    });
  } catch (error) {
    console.error("START TECHNICIAN WORK ERROR:", error);

    return fail(res, 500, "Failed to start work");
  }
};
