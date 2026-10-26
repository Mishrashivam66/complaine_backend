"use strict";

const mongoose = require("mongoose");
const Complaint = require("../../models/Complaint");
const User = require("../../models/User");
const Category = require("../../models/Category");
const JobCard = require("../../models/JobCard");
const sendNotification = require("../../utils/sendNotification");

const TECH_ROLES = ["TECHNICIAN", "WORKER"];
const SHIFTS = ["DAY", "NIGHT", "24x7"];
const MANAGER_STATUSES = ["ACTIVE", "OFFLINE", "ON_LEAVE"];
const CLOSED = ["RESOLVED", "CLOSED"];

const upper = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const validId = (value) => mongoose.isValidObjectId(value);

function send(res, status, message) {
  return res.status(status).json({
    success: false,
    message,
  });
}

function safeUser(user) {
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
// ADMIN CATEGORY MASTER
// ==========================================

async function activeCategory(name) {
  const value = String(name ?? "").trim();
  if (!value) return null;

  return Category.findOne({
    categoryName: new RegExp(`^\\s*${escapeRegex(value)}\\s*$`, "i"),
    department: "MAINTENANCE",
    isActive: { $ne: false },
    isDeleted: { $ne: true },
  }).lean();
}

// ==========================================
// FIND TECHNICIAN
// ==========================================

async function findTech(id) {
  if (!validId(id)) return null;

  return User.findOne({
    _id: id,
    role: { $in: TECH_ROLES },
    isDeleted: { $ne: true },
  });
}

// ==========================================
// IST SHIFT AVAILABILITY
// ==========================================

function istMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);

  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);

  return hour * 60 + minute;
}

function availabilityOf(worker, date = new Date()) {
  if (worker.isActive === false || worker.isDeleted === true) {
    return {
      availability: "DISABLED",
      canAssignNow: false,
    };
  }

  if (worker.status === "ON_LEAVE") {
    return {
      availability: "ON_LEAVE",
      canAssignNow: false,
    };
  }

  if (worker.status === "OFFLINE") {
    return {
      availability: "OFFLINE",
      canAssignNow: false,
    };
  }

  // 24x7 is emergency on-call, not
  // continuous scheduled work.

  if (worker.shift === "24x7") {
    return {
      availability: "ON_CALL",
      canAssignNow: false,
    };
  }

  const mins = istMinutes(date);

  const onDuty =
    worker.shift === "DAY"
      ? mins >= 9 * 60 && mins < 17 * 60
      : worker.shift === "NIGHT"
        ? mins >= 21 * 60 || mins < 5 * 60
        : false;

  return {
    availability: onDuty
      ? worker.status === "BUSY"
        ? "BUSY"
        : "ON_DUTY"
      : "OFF_DUTY",

    canAssignNow: onDuty,
  };
}

function isEmergency(complaint) {
  return (
    complaint.isEmergency === true ||
    upper(complaint.priority) === "EMERGENCY" ||
    upper(complaint.complaintType) === "EMERGENCY"
  );
}

async function notify(payload) {
  try {
    await sendNotification(payload);
  } catch (error) {
    console.error("TECHNICIAN NOTIFICATION ERROR:", error.message);
  }
}

const activeComplaintQuery = (workerId) => ({
  assignedTo: workerId,
  status: { $nin: CLOSED },
});

// ==========================================
// GET COMPLAINTS
// ==========================================

exports.getComplaintsForAssignment = async (_req, res) => {
  try {
    const complaints = await Complaint.find({})
      .populate("createdBy", "name email phone")
      .populate("assignedTo", "name email phone department shift")
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: complaints.length,
      complaints,
    });
  } catch (error) {
    console.error("FETCH COMPLAINTS ERROR:", error);

    return send(res, 500, "Failed to fetch complaints");
  }
};

// ==========================================
// GET WORKERS AND TECHNICIANS
// ==========================================

exports.getWorkers = async (_req, res) => {
  try {
    const records = await User.find({
      role: { $in: TECH_ROLES },
      isDeleted: { $ne: true },
    })
      .select(
        "name email phone role department shift status isActive isDeleted currentJobs maxJobs",
      )
      .sort({ name: 1 })
      .lean();

    const workers = records.map((worker) => ({
      ...worker,
      ...availabilityOf(worker),
    }));

    return res.json({
      success: true,
      count: workers.length,
      workers,
    });
  } catch (error) {
    console.error("FETCH TECHNICIANS ERROR:", error);

    return send(res, 500, "Failed to fetch Technicians");
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

    const cleanName = String(name ?? "").trim();

    const cleanEmail = String(email ?? "")
      .trim()
      .toLowerCase();

    const cleanPhone = String(phone ?? "").replace(/\s/g, "");

    if (
      !cleanName ||
      !cleanEmail ||
      !cleanPhone ||
      typeof password !== "string"
    ) {
      return send(res, 400, "Name, email, phone and password are required");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return send(res, 400, "Enter a valid email address");
    }

    if (!/^\+?\d{10,15}$/.test(cleanPhone)) {
      return send(res, 400, "Enter a valid phone number");
    }

    if (password.length < 8) {
      return send(res, 400, "Minimum 8-character password required");
    }

    if (!SHIFTS.includes(shift)) {
      return send(res, 400, "Invalid Technician shift");
    }

    // Validate category against Admin Master.

    const master = await activeCategory(category);

    if (!master) {
      return send(
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
      return send(res, 409, "Email already registered");
    }

    if (
      await User.exists({
        role: { $in: TECH_ROLES },
        phone: cleanPhone,
        isDeleted: { $ne: true },
      })
    ) {
      return send(res, 409, "Technician with this phone already exists");
    }

    // Password is hashed by User.js.

    const technician = await User.create({
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      password,

      role: "TECHNICIAN",

      department: master.categoryName,
      designation: "Maintenance Technician",

      shift,
      status: "ACTIVE",

      currentJobs: 0,
      maxJobs: 10,

      isActive: true,
      isDeleted: false,
      isApproved: true,

      // Account is provisioned by an
      // authorized Maintenance Manager.
      // This is not proof of email ownership.
      isVerified: true,
    });

    return res.status(201).json({
      success: true,
      accountCreated: true,
      loginCreated: true,

      message: "Technician account created successfully",

      worker: safeUser(technician),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return send(res, 409, "Account identifier already exists");
    }

    console.error("CREATE TECHNICIAN ERROR:", error);

    return send(res, 500, "Failed to create Technician");
  }
};

// ==========================================
// UPGRADE LEGACY WORKER LOGIN
// PRESERVE SAME USER ID
// ==========================================

exports.activateLegacyTechnicianLogin = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    const cleanEmail = String(email ?? "")
      .trim()
      .toLowerCase();

    if (!validId(req.params.id)) {
      return send(res, 400, "Invalid Worker ID");
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) ||
      typeof password !== "string" ||
      password.length < 8
    ) {
      return send(
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
      return send(res, 404, "Legacy Worker not found or already upgraded");
    }

    if (
      await User.exists({
        email: cleanEmail,
        _id: { $ne: worker._id },
      })
    ) {
      return send(res, 409, "Email already in use");
    }

    worker.email = cleanEmail;
    worker.password = password;
    worker.role = "TECHNICIAN";
    worker.isVerified = true;
    worker.isApproved = true;
    worker.designation = "Maintenance Technician";

    await worker.save();

    return res.json({
      success: true,

      message: "Worker upgraded to Technician; assigned complaints preserved",

      worker: safeUser(worker),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return send(res, 409, "Email already in use");
    }

    console.error("ACTIVATE WORKER LOGIN ERROR:", error);

    return send(res, 500, "Could not activate legacy Worker login");
  }
};

// ==========================================
// UPDATE TECHNICIAN
// ==========================================

exports.updateWorker = async (req, res) => {
  try {
    const worker = await findTech(req.params.id);

    if (!worker) {
      return send(res, 404, "Technician not found");
    }

    const { name, phone, category, department, shift } = req.body || {};

    if (name !== undefined) {
      if (!String(name).trim()) {
        return send(res, 400, "Name cannot be empty");
      }

      worker.name = String(name).trim();
    }

    if (phone !== undefined) {
      const cleanPhone = String(phone).replace(/\s/g, "");

      if (!/^\+?\d{10,15}$/.test(cleanPhone)) {
        return send(res, 400, "Invalid phone number");
      }

      if (
        await User.exists({
          _id: { $ne: worker._id },
          phone: cleanPhone,
          role: { $in: TECH_ROLES },
          isDeleted: { $ne: true },
        })
      ) {
        return send(
          res,
          409,
          "Phone number already used by another Technician",
        );
      }

      worker.phone = cleanPhone;
    }

    // Only Admin-created categories accepted.

    if (category !== undefined || department !== undefined) {
      const master = await activeCategory(category ?? department);

      if (!master) {
        return send(
          res,
          400,
          "Select an active Admin-created Maintenance category",
        );
      }

      if (upper(worker.department) !== upper(master.categoryName)) {
        const openJobs = await Complaint.countDocuments(
          activeComplaintQuery(worker._id),
        );

        if (openJobs) {
          return send(
            res,
            409,
            "Reassign or finish active jobs before changing Technician category",
          );
        }
      }

      worker.department = master.categoryName;
    }

    if (shift !== undefined) {
      if (!SHIFTS.includes(shift)) {
        return send(res, 400, "Invalid shift");
      }

      worker.shift = shift;
    }

    await worker.save();

    return res.json({
      success: true,
      message: "Technician updated",
      worker: safeUser(worker),
    });
  } catch (error) {
    console.error("UPDATE TECHNICIAN ERROR:", error);

    return send(res, 500, "Failed to update Technician");
  }
};

// ==========================================
// UPDATE TECHNICIAN STATUS
// ==========================================

exports.updateWorkerStatus = async (req, res) => {
  try {
    const worker = await findTech(req.params.id);

    if (!worker) {
      return send(res, 404, "Technician not found");
    }

    const status = upper(req.body?.status);

    if (!MANAGER_STATUSES.includes(status)) {
      return send(res, 400, "Allowed: ACTIVE, OFFLINE, ON_LEAVE");
    }

    if (worker.isActive === false && status === "ACTIVE") {
      return send(res, 409, "Disabled Technician cannot be activated here");
    }

    worker.status = status;

    await worker.save();

    return res.json({
      success: true,
      message: "Technician status updated",
      worker: safeUser(worker),
    });
  } catch (error) {
    console.error("TECHNICIAN STATUS ERROR:", error);

    return send(res, 500, "Failed to update Technician status");
  }
};

// ==========================================
// ARCHIVE TECHNICIAN
// ==========================================

exports.deleteWorker = async (req, res) => {
  try {
    const worker = await findTech(req.params.id);

    if (!worker) {
      return send(res, 404, "Technician not found");
    }

    const [openComplaints, openJobCards] = await Promise.all([
      Complaint.countDocuments(activeComplaintQuery(worker._id)),

      JobCard.countDocuments({
        assignedWorker: worker._id,
        isCompleted: { $ne: true },
      }),
    ]);

    if (openComplaints || openJobCards) {
      return send(
        res,
        409,
        "Technician has unfinished assignments. Reassign/finish them before archiving.",
      );
    }

    worker.isActive = false;
    worker.isDeleted = true;
    worker.deletedAt = new Date();
    worker.deletedBy = req.user?._id || null;
    worker.status = "OFFLINE";

    await worker.save();

    return res.json({
      success: true,
      message: "Technician archived; history preserved",
    });
  } catch (error) {
    console.error("ARCHIVE TECHNICIAN ERROR:", error);

    return send(res, 500, "Failed to archive Technician");
  }
};

// ==========================================
// ASSIGN TECHNICIAN
// SAME LOGIC FOR BOTH ASSIGNMENT ROUTES
// ==========================================

exports.assignWorker = async (req, res) => {
  try {
    const { complaintId, workerId } = req.body || {};

    if (!validId(complaintId) || !validId(workerId)) {
      return send(res, 400, "Valid Complaint and Technician IDs required");
    }

    const [complaint, worker] = await Promise.all([
      Complaint.findById(complaintId).populate("createdBy", "name phone email"),
      findTech(workerId),
    ]);

    if (!complaint) {
      return send(res, 404, "Complaint not found");
    }

    if (!worker) {
      return send(res, 404, "Technician not found");
    }

    // Prevent new assignments to legacy
    // accounts with insecure credentials.

    if (worker.role !== "TECHNICIAN") {
      return send(
        res,
        409,
        "Legacy Worker must activate secure Technician login before receiving new assignments",
      );
    }

    if (complaint.assignedTo || complaint.workerAssigned === true) {
      return send(res, 409, "Complaint already assigned");
    }

    if (!["PENDING", "REOPENED"].includes(upper(complaint.status))) {
      return send(res, 409, "Complaint is not eligible for assignment");
    }

    // ======================================
    // CATEGORY VALIDATION
    // ======================================

    const master = await activeCategory(complaint.category);

    if (!master) {
      return send(
        res,
        409,
        `Complaint category '${complaint.category}' is not an active Admin category. Review and safely correct the legacy complaint category.`,
      );
    }

    if (upper(worker.department) !== upper(master.categoryName)) {
      return send(
        res,
        409,
        `Category mismatch: complaint '${master.categoryName}', Technician '${worker.department}'. Use the same Admin category.`,
      );
    }

    // ======================================
    // SHIFT AVAILABILITY
    // ======================================

    const availability = availabilityOf(worker);

    const emergencyOnCall =
      isEmergency(complaint) && availability.availability === "ON_CALL";

    if (!availability.canAssignNow && !emergencyOnCall) {
      return send(
        res,
        409,
        `Technician availability: ${availability.availability}. Choose an on-duty Technician.`,
      );
    }

    // ======================================
    // JOB CAPACITY
    // ======================================

    const activeJobs = await Complaint.countDocuments(
      activeComplaintQuery(worker._id),
    );

    const maxJobs = Number.isInteger(worker.maxJobs) ? worker.maxJobs : 10;

    if (activeJobs >= maxJobs) {
      return send(res, 409, "Technician has reached job capacity");
    }

    // ======================================
    // ATOMIC COMPLAINT ASSIGNMENT
    // ======================================

    const assigned = await Complaint.findOneAndUpdate(
      {
        _id: complaint._id,
        assignedTo: null,
        workerAssigned: { $ne: true },
        status: complaint.status,
      },
      {
        $set: {
          assignedTo: worker._id,
          assignedBy: req.user._id,
          workerAssigned: true,
          status: "IN_PROGRESS",
          startedAt: new Date(),
        },
      },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!assigned) {
      return send(res, 409, "Complaint was assigned elsewhere. Refresh list.");
    }

    // Preserve materialRequired,
    // materialDecision and material history.
    // Normal jobs remain digital.
    // Physical Emergency JobCards are handled
    // separately by the Emergency JobCard flow.

    await User.updateOne(
      {
        _id: worker._id,
        status: "ACTIVE",
      },
      {
        $set: {
          status: "BUSY",
        },
      },
    );

    // ======================================
    // NOTIFY TECHNICIAN
    // ======================================

    await notify({
      receiver: worker._id,
      sender: req.user._id,

      title: "New Complaint Assigned",

      message: `Complaint ${assigned.complaintId} has been assigned to you.`,

      type: "WORKER_ASSIGN",
      relatedComplaint: assigned._id,
      actionUrl: "/technician/dashboard",
    });

    // ======================================
    // NOTIFY STUDENT
    // ======================================

    if (complaint.createdBy?._id) {
      await notify({
        receiver: complaint.createdBy._id,
        sender: req.user._id,

        title: "Technician Assigned",

        message: `${worker.name} has been assigned to complaint ${assigned.complaintId}.`,

        type: "STATUS_UPDATE",
        relatedComplaint: assigned._id,
        actionUrl: "/dashboard",
      });
    }

    return res.json({
      success: true,
      message: "Technician assigned successfully",

      complaint: {
        _id: assigned._id,
        complaintId: assigned.complaintId,
        status: assigned.status,
        assignedTo: worker._id,

        materialDecision: assigned.materialDecision,

        materialRequired: assigned.materialRequired,
      },
    });
  } catch (error) {
    console.error("ASSIGN TECHNICIAN ERROR:", error);

    return send(res, 500, "Failed to assign Technician");
  }
};
