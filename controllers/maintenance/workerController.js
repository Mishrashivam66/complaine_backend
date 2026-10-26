"use strict";

const mongoose = require("mongoose");

const Complaint = require("../../models/Complaint");
const User = require("../../models/User");
const JobCard = require("../../models/JobCard");
const sendNotification = require("../../utils/sendNotification");

// ==========================================
// CONFIG
// ==========================================

const TECHNICIAN_ROLES = ["TECHNICIAN", "WORKER"];

const SHIFTS = ["DAY", "NIGHT", "24x7"];

const MANAGED_STATUSES = ["ACTIVE", "OFFLINE", "ON_LEAVE"];

const OPEN_JOB_STATUSES = [
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_MATERIAL",
  "AWAITING_STUDENT_CONFIRMATION",
];

// Example university shift times.
// Confirm actual timings before production.
const SHIFT_WINDOWS = {
  DAY: {
    from: 9 * 60,
    to: 17 * 60,
  },
  NIGHT: {
    from: 21 * 60,
    to: 5 * 60,
  },
};

const normalize = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

const isObjectId = (value) => mongoose.isValidObjectId(value);

// ==========================================
// SAFE RESPONSE
// NEVER RETURN PASSWORD
// ==========================================

function outputTechnician(user) {
  const item = typeof user.toObject === "function" ? user.toObject() : user;

  return {
    _id: item._id,
    name: item.name,
    email: item.email,
    phone: item.phone,
    role: item.role,
    department: item.department,
    shift: item.shift,
    status: item.status,
    isActive: item.isActive,
    currentJobs: item.currentJobs,
    maxJobs: item.maxJobs,
  };
}

// ==========================================
// IST SHIFT CALCULATION
// ==========================================

function minutesIST(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);

  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0,
  );

  return hour * 60 + minute;
}

function withinWindow(now, from, to) {
  if (from <= to) {
    return now >= from && now < to;
  }

  return now >= from || now < to;
}

// ==========================================
// AUTOMATIC DUTY AVAILABILITY
// ==========================================

function availabilityOf(worker) {
  if (!worker.isActive || worker.isDeleted) {
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

  if (worker.shift === "24x7") {
    return {
      availability: "ON_CALL",
      canAssignNow: false,
    };
  }

  const window = SHIFT_WINDOWS[worker.shift];

  const onDuty = window
    ? withinWindow(minutesIST(), window.from, window.to)
    : false;

  return {
    availability: !onDuty
      ? "OFF_DUTY"
      : worker.status === "BUSY"
        ? "BUSY"
        : "ON_DUTY",

    canAssignNow: onDuty,
  };
}

function isEmergency(complaint) {
  return (
    complaint.isEmergency === true ||
    normalize(complaint.priority) === "EMERGENCY" ||
    normalize(complaint.complaintType) === "EMERGENCY"
  );
}

// ==========================================
// FIND EXISTING TECHNICIAN
// ==========================================

async function findTechnician(id) {
  if (!isObjectId(id)) {
    return null;
  }

  return User.findOne({
    _id: id,
    role: {
      $in: TECHNICIAN_ROLES,
    },
    isDeleted: {
      $ne: true,
    },
  });
}

// ==========================================
// GET COMPLAINTS
// ==========================================

exports.getComplaintsForAssignment = async (_req, res) => {
  try {
    const complaints = await Complaint.find({})
      .populate("createdBy", "name email phone")
      .populate("assignedTo", "name email phone department shift")
      .sort({
        createdAt: -1,
      });

    return res.status(200).json({
      success: true,
      count: complaints.length,
      complaints,
    });
  } catch (error) {
    console.error("GET COMPLAINTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch complaints",
    });
  }
};

// ==========================================
// GET TECHNICIANS
// LEGACY WORKERS INCLUDED
// ==========================================

exports.getWorkers = async (_req, res) => {
  try {
    const workers = await User.find({
      role: {
        $in: TECHNICIAN_ROLES,
      },
      isDeleted: {
        $ne: true,
      },
    })
      .select(
        "name email phone role department shift status isActive isDeleted currentJobs maxJobs designation",
      )
      .sort({
        name: 1,
      })
      .lean();

    return res.status(200).json({
      success: true,
      count: workers.length,

      workers: workers.map((worker) => ({
        ...worker,
        ...availabilityOf(worker),
      })),
    });
  } catch (error) {
    console.error("GET TECHNICIANS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch Technicians",
    });
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

    const cleanPhone = String(phone || "")
      .replace(/\s/g, "")
      .trim();

    const cleanCategory = normalize(category);

    if (
      !cleanName ||
      !cleanEmail ||
      !cleanPhone ||
      !cleanCategory ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Name, email, mobile, password and category are required",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address",
      });
    }

    if (!/^\+?\d{10,15}$/.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid mobile number",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Initial password must be at least 8 characters",
      });
    }

    if (!SHIFTS.includes(shift)) {
      return res.status(400).json({
        success: false,
        message: "Invalid duty shift",
      });
    }

    // EMAIL DUPLICATE

    if (
      await User.exists({
        email: cleanEmail,
      })
    ) {
      return res.status(409).json({
        success: false,
        message: "This email is already registered",
      });
    }

    // MOBILE DUPLICATE

    const duplicate = await User.exists({
      role: {
        $in: TECHNICIAN_ROLES,
      },
      phone: cleanPhone,
      isDeleted: {
        $ne: true,
      },
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: "A Technician with this mobile number already exists",
      });
    }

    // CREATE USER ACCOUNT
    // User.js hashes password before save.

    const technician = await User.create({
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      password,

      role: "TECHNICIAN",
      department: cleanCategory,
      designation: "Maintenance Technician",

      shift,
      status: "ACTIVE",

      currentJobs: 0,
      maxJobs: 10,

      isActive: true,
      isVerified: true,
      isApproved: true,
      isDeleted: false,
    });

    return res.status(201).json({
      success: true,
      accountCreated: true,
      loginCreated: true,

      message: "Technician login account created successfully",

      worker: outputTechnician(technician),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Email or unique identifier is already in use",
      });
    }

    console.error("CREATE TECHNICIAN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create Technician account",
    });
  }
};

// ==========================================
// ACTIVATE EXISTING LEGACY WORKER LOGIN
// PRESERVES ORIGINAL USER ID
// ==========================================

exports.activateLegacyTechnicianLogin = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    const cleanEmail = String(email || "")
      .trim()
      .toLowerCase();

    if (!isObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Technician ID",
      });
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) ||
      typeof password !== "string" ||
      password.length < 8
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid email and password of at least 8 characters are required",
      });
    }

    const worker = await User.findOne({
      _id: req.params.id,
      role: "WORKER",
      isDeleted: {
        $ne: true,
      },
    });

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: "Legacy Worker not found or already activated",
      });
    }

    const duplicate = await User.exists({
      email: cleanEmail,
      _id: {
        $ne: worker._id,
      },
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: "Email already in use",
      });
    }

    // UPGRADE SAME ACCOUNT
    // NO NEW OBJECT ID

    worker.email = cleanEmail;
    worker.password = password;
    worker.role = "TECHNICIAN";
    worker.isVerified = true;
    worker.isApproved = true;
    worker.designation = "Maintenance Technician";

    await worker.save();

    return res.status(200).json({
      success: true,
      accountCreated: true,

      message:
        "Legacy Worker login activated; existing assignments were preserved",

      worker: outputTechnician(worker),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Email already in use",
      });
    }

    console.error("ACTIVATE LEGACY TECHNICIAN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Could not activate Technician login",
    });
  }
};

// ==========================================
// UPDATE TECHNICIAN PROFILE
// ==========================================

exports.updateWorker = async (req, res) => {
  try {
    const worker = await findTechnician(req.params.id);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: "Technician not found",
      });
    }

    const { name, phone, category, department, shift } = req.body || {};

    if (name !== undefined) {
      if (!String(name).trim()) {
        return res.status(400).json({
          success: false,
          message: "Name cannot be empty",
        });
      }

      worker.name = String(name).trim();
    }

    if (phone !== undefined) {
      const cleanPhone = String(phone).replace(/\s/g, "").trim();

      if (!/^\+?\d{10,15}$/.test(cleanPhone)) {
        return res.status(400).json({
          success: false,
          message: "Invalid mobile number",
        });
      }

      const duplicate = await User.exists({
        _id: {
          $ne: worker._id,
        },
        role: {
          $in: TECHNICIAN_ROLES,
        },
        phone: cleanPhone,
        isDeleted: {
          $ne: true,
        },
      });

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "Mobile number already belongs to another Technician",
        });
      }

      worker.phone = cleanPhone;
    }

    if (category !== undefined || department !== undefined) {
      const cleanCategory = normalize(category ?? department);

      if (!cleanCategory) {
        return res.status(400).json({
          success: false,
          message: "Category cannot be empty",
        });
      }

      worker.department = cleanCategory;
    }

    if (shift !== undefined) {
      if (!SHIFTS.includes(shift)) {
        return res.status(400).json({
          success: false,
          message: "Invalid shift",
        });
      }

      worker.shift = shift;
    }

    await worker.save();

    return res.status(200).json({
      success: true,
      message: "Technician updated successfully",
      worker: outputTechnician(worker),
    });
  } catch (error) {
    console.error("UPDATE TECHNICIAN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update Technician",
    });
  }
};

// ==========================================
// MANUAL STATUS CONTROL
// ==========================================

exports.updateWorkerStatus = async (req, res) => {
  try {
    const worker = await findTechnician(req.params.id);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: "Technician not found",
      });
    }

    const status = normalize(req.body?.status);

    if (!MANAGED_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Allowed statuses: ACTIVE, OFFLINE, ON_LEAVE",
      });
    }

    if (!worker.isActive && status === "ACTIVE") {
      return res.status(400).json({
        success: false,
        message: "Archived accounts cannot be activated",
      });
    }

    worker.status = status;

    await worker.save();

    return res.status(200).json({
      success: true,
      message: `Technician status changed to ${status}`,
      worker: outputTechnician(worker),
    });
  } catch (error) {
    console.error("STATUS UPDATE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update Technician status",
    });
  }
};

// ==========================================
// SAFE SOFT DELETE
// ==========================================

exports.deleteWorker = async (req, res) => {
  try {
    const worker = await findTechnician(req.params.id);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: "Technician not found",
      });
    }

    const openJobs = await Complaint.countDocuments({
      assignedTo: worker._id,
      status: {
        $in: OPEN_JOB_STATUSES,
      },
    });

    if (openJobs > 0) {
      return res.status(409).json({
        success: false,
        message: `Technician has ${openJobs} active complaint(s). Reassign them before removing access.`,
      });
    }

    worker.isActive = false;
    worker.isDeleted = true;

    worker.deletedAt = new Date();
    worker.deletedBy = req.user?._id || null;

    worker.status = "OFFLINE";

    await worker.save();

    return res.status(200).json({
      success: true,
      message:
        "Technician archived and access disabled. Historical job references preserved.",
    });
  } catch (error) {
    console.error("DELETE TECHNICIAN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to archive Technician",
    });
  }
};

// ==========================================
// ASSIGN TECHNICIAN
// ==========================================

exports.assignWorker = async (req, res) => {
  try {
    const { complaintId, workerId } = req.body || {};

    if (!isObjectId(complaintId) || !isObjectId(workerId)) {
      return res.status(400).json({
        success: false,
        message: "Valid complaint ID and Technician ID are required",
      });
    }

    const [complaint, worker] = await Promise.all([
      Complaint.findById(complaintId),
      findTechnician(workerId),
    ]);

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: "Technician not found",
      });
    }

    if (complaint.assignedTo || complaint.workerAssigned) {
      return res.status(409).json({
        success: false,
        message: "Complaint already assigned",
      });
    }

    if (!["PENDING", "REOPENED"].includes(normalize(complaint.status))) {
      return res.status(409).json({
        success: false,
        message: "Complaint is not in an assignable status",
      });
    }

    // CATEGORY MATCH

    if (normalize(worker.department) !== normalize(complaint.category)) {
      return res.status(400).json({
        success: false,
        message: "Technician category does not match complaint category",
      });
    }

    // SHIFT AVAILABILITY

    const availability = availabilityOf(worker);

    const allowEmergencyOnCall =
      isEmergency(complaint) && availability.availability === "ON_CALL";

    if (!availability.canAssignNow && !allowEmergencyOnCall) {
      return res.status(409).json({
        success: false,
        message: `Technician is currently ${availability.availability}. Select an on-duty Technician.`,
      });
    }

    // MAX CONCURRENT JOBS

    const activeCount = await Complaint.countDocuments({
      assignedTo: worker._id,
      status: {
        $in: OPEN_JOB_STATUSES,
      },
    });

    const capacity = Number.isFinite(worker.maxJobs) ? worker.maxJobs : 10;

    if (activeCount >= capacity) {
      return res.status(409).json({
        success: false,
        message: "Technician has reached maximum concurrent jobs",
      });
    }

    const now = new Date();

    // ATOMIC COMPLAINT ASSIGNMENT

    const assigned = await Complaint.findOneAndUpdate(
      {
        _id: complaint._id,
        assignedTo: null,
        status: complaint.status,
      },
      {
        $set: {
          assignedTo: worker._id,
          assignedBy: req.user._id,
          workerAssigned: true,
          status: "IN_PROGRESS",
          startedAt: now,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!assigned) {
      return res.status(409).json({
        success: false,
        message: "Complaint was assigned by another request",
      });
    }

    if (worker.status !== "BUSY") {
      await User.updateOne(
        {
          _id: worker._id,
        },
        {
          $set: {
            status: "BUSY",
          },
        },
      );
    }

    // ======================================
    // TEMPORARY LEGACY JOB CARD SYNC
    // ======================================
    // Existing Technician dashboard may rely
    // on JobCard records.
    // Keep this compatibility until its
    // job-list API is migrated to Complaints.
    // Printable JobCards must ultimately
    // be restricted to emergencies.

    try {
      let card = await JobCard.findOne({
        hostel: assigned.hostel,
        category: assigned.category,
        assignedWorker: worker._id,
        isCompleted: false,
        totalComplaints: {
          $lt: 10,
        },
      });

      const entry = {
        serialNumber: card ? card.complaints.length + 1 : 1,

        complaint: assigned._id,

        roomNumber: assigned.roomNumber,
        floor: assigned.floor,

        title: assigned.title,
        titleHindi: assigned.titleHindi,

        description: assigned.description,
        descriptionHindi: assigned.descriptionHindi,

        priority: assigned.priority,
        status: "ASSIGNED",
        startedAt: now,

        materialRequired: assigned.materialRequired || false,

        materialStatus: assigned.materialRequired ? "PENDING" : "NOT_REQUIRED",
      };

      if (card) {
        card.complaints.push(entry);

        card.workerStatus = "WORKING";
        card.status = "IN_PROGRESS";

        await card.save();
      } else {
        await JobCard.create({
          jobCardId: `JOB-${Date.now()}-${String(assigned._id).slice(-5)}`,

          hostel: assigned.hostel,
          block: assigned.block,
          category: assigned.category,

          assignedWorker: worker._id,
          assignedBy: req.user._id,

          status: "IN_PROGRESS",
          workerStatus: "WORKING",
          startedAt: now,

          complaints: [entry],
        });
      }
    } catch (cardError) {
      console.error("Legacy JobCard sync failed after assignment:", cardError);
    }

    // ======================================
    // NOTIFICATION
    // ======================================

    try {
      await sendNotification({
        receiver: worker._id,
        sender: req.user._id,

        title: "New Complaint Assigned",

        message: `You have been assigned complaint ${assigned.complaintId}`,

        type: "WORKER_ASSIGN",
        relatedComplaint: assigned._id,
      });
    } catch (notificationError) {
      console.error(
        "Assignment saved but notification failed:",
        notificationError,
      );
    }

    return res.status(200).json({
      success: true,
      message: "Technician assigned successfully",
      complaint: assigned.complaintId,
    });
  } catch (error) {
    console.error("ASSIGN TECHNICIAN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to assign Technician",
    });
  }
};
