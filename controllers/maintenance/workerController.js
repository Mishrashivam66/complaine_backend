"use strict";

const mongoose = require("mongoose");

const Complaint = require("../../models/Complaint");
const User = require("../../models/User");
const Category = require("../../models/Category");
const JobCard = require("../../models/JobCard");
const sendNotification = require("../../utils/sendNotification");

// ==========================================
// CONSTANTS
// ==========================================

const TECH_ROLES = ["TECHNICIAN", "WORKER"];

const SHIFTS = ["DAY", "NIGHT", "24x7"];

const MANAGED_STATUSES = ["ACTIVE", "OFFLINE", "ON_LEAVE"];

const CLOSED_STATUSES = ["RESOLVED", "CLOSED", "REJECTED", "CANCELLED"];

const TECH_COUNTER_ID = "ami_maintenance_technician_id";

// ==========================================
// COMMON HELPERS
// ==========================================

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

    technicianId: user.technicianId || "",

    employeeId: user.employeeId || "",

    name: user.name,
    email: user.email,
    phone: user.phone,

    role: user.role,
    department: user.department,
    shift: user.shift,
    status: user.status,

    isActive: user.isActive,
    isDeleted: user.isDeleted,

    currentJobs: user.currentJobs,
    maxJobs: user.maxJobs,
  };
}

// ==========================================
// PERMANENT TECHNICIAN ID GENERATION
// ==========================================

// Format:
// TECH-000001
// TECH-000002
//
// This counter is shared by all backend
// instances through MongoDB.
//
// The existing User._id is never changed.
//
// Existing TECH IDs are checked before
// creating a new Technician ID.

async function generateTechnicianId() {
  const counters = mongoose.connection.db.collection("counters");

  const users = mongoose.connection.db.collection(User.collection.name);

  // Check existing TECH IDs before advancing
  // the counter. This also supports a database
  // that already contains Technician IDs.

  const existingIds = await users
    .find(
      {
        technicianId: /^TECH-\d+$/,
      },
      {
        projection: {
          technicianId: 1,
        },
      },
    )
    .toArray();

  let highestExisting = 0;

  for (const user of existingIds) {
    const match = /^TECH-(\d+)$/.exec(String(user.technicianId || ""));

    if (!match) continue;

    const sequence = Number(match[1]);

    if (Number.isSafeInteger(sequence) && sequence > highestExisting) {
      highestExisting = sequence;
    }
  }

  // Initialize the counter only if missing.
  // Existing counters are never reset here.

  await counters.updateOne(
    {
      _id: TECH_COUNTER_ID,
    },
    {
      $setOnInsert: {
        sequence: highestExisting,
      },
    },
    {
      upsert: true,
    },
  );

  // Atomic increment.

  for (let attempt = 0; attempt < 10; attempt++) {
    const result = await counters.findOneAndUpdate(
      {
        _id: TECH_COUNTER_ID,
      },
      {
        $inc: {
          sequence: 1,
        },
      },
      {
        returnDocument: "after",
      },
    );

    // Compatible with native MongoDB driver
    // versions returning either a document
    // or { value: document }.

    const counter = result?.value || result;

    const sequence = Number(counter?.sequence);

    if (!Number.isSafeInteger(sequence) || sequence < 1) {
      throw new Error("Failed to generate Technician ID");
    }

    const technicianId = `TECH-${String(sequence).padStart(6, "0")}`;

    // Defensive existence check.
    // The unique DB index remains the
    // final protection against duplicates.

    const exists = await User.exists({
      technicianId,
    });

    if (!exists) {
      return technicianId;
    }
  }

  throw new Error("Unable to allocate a unique Technician ID");
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

function availabilityOf(worker) {
  const role = upper(worker.role);
  const status = upper(worker.status);

  const disabled = worker.isActive === false || worker.isDeleted === true;

  const unavailable = status === "ON_LEAVE" || status === "OFFLINE";

  const canWork = role === "TECHNICIAN" && !disabled && !unavailable;

  return {
    availability: disabled
      ? "DISABLED"
      : unavailable
        ? status
        : status === "BUSY"
          ? "BUSY"
          : "AVAILABLE",

    // Preserve existing policy:
    // Off-duty scheduling is allowed.
    // Offline/leave/archived blocked.

    canScheduleAssignment: canWork,
    canAssignNow: canWork,
    canStartNow: canWork,
  };
}

const openAssignedFilter = (technicianId) => ({
  assignedTo: technicianId,

  status: {
    $nin: CLOSED_STATUSES,
  },
});

// ==========================================
// ACTIVE CATEGORY LOOKUP
// ==========================================

async function activeCategory(name) {
  const trimmed = String(name ?? "").trim();

  if (!trimmed) return null;

  return Category.findOne({
    department: "MAINTENANCE",

    categoryName: new RegExp(`^\\s*${escapeRegex(trimmed)}\\s*$`, "i"),

    isActive: {
      $ne: false,
    },

    isDeleted: {
      $ne: true,
    },
  }).lean();
}

// ==========================================
// FIND EXISTING TECHNICIAN
// ==========================================

async function findTechnician(id) {
  if (!validId(id)) {
    return null;
  }

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
      .populate(
        "assignedTo",
        "name email phone department shift technicianId employeeId",
      )
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
        "name email phone role department " +
          "shift status isActive isDeleted " +
          "currentJobs maxJobs technicianId employeeId",
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

    const duplicateEmail = await User.exists({
      email: cleanEmail,
    });

    if (duplicateEmail) {
      return fail(res, 409, "Email already registered");
    }

    const duplicatePhone = await User.exists({
      phone: cleanPhone,

      role: {
        $in: TECH_ROLES,
      },

      isDeleted: {
        $ne: true,
      },
    });

    if (duplicatePhone) {
      return fail(res, 409, "Technician mobile number already registered");
    }

    // Generate the permanent Technician ID.
    // Never derive identity from a name.

    const technicianId = await generateTechnicianId();

    // User.js hashes the password.

    const technician = await User.create({
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      password,

      technicianId,

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
      return fail(
        res,
        409,
        "Email, mobile or Technician ID already registered",
      );
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
      isDeleted: {
        $ne: true,
      },
    });

    if (!worker) {
      return fail(res, 404, "Legacy Worker not found");
    }

    const existingEmail = await User.exists({
      email,
      _id: {
        $ne: worker._id,
      },
    });

    if (existingEmail) {
      return fail(res, 409, "Email is already in use");
    }

    // Keep the existing MongoDB User ID.

    worker.email = email;
    worker.password = password;
    worker.role = "TECHNICIAN";

    worker.isVerified = true;
    worker.isApproved = true;

    worker.designation = "Maintenance Technician";

    // Assign a readable ID only if missing.

    if (!worker.technicianId) {
      worker.technicianId = await generateTechnicianId();
    }

    await worker.save();

    return res.json({
      success: true,

      message: "Legacy Worker upgraded. Existing assignment IDs preserved.",

      worker: outputUser(worker),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return fail(res, 409, "Email or Technician ID already in use");
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
        _id: {
          $ne: technician._id,
        },

        phone: cleanPhone,

        role: {
          $in: TECH_ROLES,
        },

        isDeleted: {
          $ne: true,
        },
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
            "Complete or reassign active jobs before changing Technician category",
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

    // Do not change the existing User._id
    // or permanent technicianId.

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

        isCompleted: {
          $ne: true,
        },
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
// ASSIGN EXISTING TECHNICIAN
//
// Assignment is scheduling.
// It does not create a new User.
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

    const duty = availabilityOf(technician);

    if (!duty.canScheduleAssignment) {
      return fail(
        res,
        409,
        `Technician cannot be assigned: ${duty.availability}`,
      );
    }

    const openJobs = await Complaint.countDocuments(
      openAssignedFilter(technician._id),
    );

    const maxJobs = Number.isInteger(technician.maxJobs)
      ? technician.maxJobs
      : 10;

    if (openJobs >= maxJobs) {
      return fail(res, 409, "Technician has reached maximum open jobs");
    }

    const statuses = Complaint.schema.path("status")?.enumValues || [];

    if (statuses.length && !statuses.includes("ASSIGNED")) {
      return fail(
        res,
        500,
        "Complaint schema status enum is missing ASSIGNED. Add it before using scheduled assignment.",
      );
    }

    // ======================================
    // ATOMIC ASSIGNMENT
    // ======================================

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
          // Existing permanent User ID.
          assignedTo: technician._id,

          assignedBy: req.user?._id || req.user?.id,

          workerAssigned: true,

          status: "ASSIGNED",
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

    // ======================================
    // NOTIFICATIONS
    // ======================================

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

        technicianId: technician.technicianId || "",

        employeeId: technician.employeeId || "",

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

    const duty = availabilityOf(technician);

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
