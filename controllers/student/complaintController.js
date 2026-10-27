"use strict";

const crypto = require("crypto");

const Complaint = require("../../models/Complaint");
const Category = require("../../models/Category");
const User = require("../../models/User");

const sendNotification = require("../../utils/sendNotification");
const translate = require("translate-google");

const { loadComplaintFormCatalog } = require("./complaintFormConfigController");

// =====================================================
// HELPERS
// =====================================================

const str = (value) => String(value ?? "").trim();

const upper = (value) => str(value).toUpperCase();

const normalize = (value) => upper(value).replace(/[^A-Z0-9]/g, "");

const currentUserId = (req) => req.user?._id || req.user?.id;

// =====================================================
// TECHNICAL TERMS
// =====================================================

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

// =====================================================
// NOTIFICATION PRIORITY
// =====================================================

function getNotificationPriority(value) {
  const priority = upper(value);

  if (priority === "URGENT") return "CRITICAL";
  if (priority === "HIGH") return "HIGH";
  if (priority === "MEDIUM") return "MEDIUM";

  return "LOW";
}

async function safeSendNotification(data) {
  try {
    await sendNotification(data);
  } catch (error) {
    console.error("NOTIFICATION ERROR:", error.message);
  }
}

// =====================================================
// STATUS NOTIFICATION MESSAGES
// =====================================================

const statusMessages = {
  PENDING: "is currently pending.",

  ASSIGNED: "has been assigned to a Technician.",

  IN_PROGRESS: "repair work has started.",

  WAITING_MATERIAL: "is waiting for required material.",

  COMPLETED: "has been marked completed. Please verify the repair.",

  RESOLVED: "has been resolved after verification.",

  CLOSED: "has been closed.",

  REOPENED: "has been reopened and needs further attention.",
};

function getStatusNotification(status, complaint) {
  const key = upper(status);

  const names = {
    PENDING: "Complaint Pending",
    ASSIGNED: "Technician Assigned",
    IN_PROGRESS: "Work In Progress",
    WAITING_MATERIAL: "Waiting for Material",
    COMPLETED: "Work Completed",
    RESOLVED: "Complaint Resolved",
    CLOSED: "Complaint Closed",
    REOPENED: "Complaint Reopened",
  };

  return {
    title: names[key] || "Complaint Updated",

    message: `${complaint.complaintId || "Complaint"} ${
      statusMessages[key] || `status changed to ${key}.`
    }`,
  };
}

// =====================================================
// HOSTEL FLOOR AUTO-DETECTION
// =====================================================

function detectHostelFloor(roomNumber) {
  const room = upper(roomNumber).replace(/\s+/g, "");

  if (/^G/.test(room)) {
    return "Ground Floor";
  }

  if (/^F/.test(room)) {
    return "First Floor";
  }

  if (/^S[23]/.test(room)) {
    return "Second Floor";
  }

  return "";
}

// =====================================================
// HOSTEL MATCHING
// =====================================================

function matchesHostel(hostel, registeredHostel) {
  const own = normalize(registeredHostel);

  if (!own) return false;

  return [hostel.id, hostel.code, hostel.name].some((candidate) => {
    const item = normalize(candidate);

    return (
      item === own || item.replace(/^HOSTEL/, "") === own.replace(/^HOSTEL/, "")
    );
  });
}

// =====================================================
// FIND LOCATION FROM ADMIN CATALOG
// =====================================================

function findSelection(catalog, type, id) {
  const groups = {
    HOSTEL: catalog.hostels,
    BLOCK: catalog.academicBlocks,
    OTHER: catalog.otherLocations,
  };

  return (groups[type] || []).find((item) => item.id === id) || null;
}

// =====================================================
// INDIAN STANDARD TIME
// =====================================================

function istNow() {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",

      year: "numeric",
      month: "2-digit",
      day: "2-digit",

      hour: "2-digit",
      minute: "2-digit",

      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value]),
  );

  return {
    date: `${values.year}-${values.month}-${values.day}`,

    minute: Number(values.hour) * 60 + Number(values.minute),
  };
}

// =====================================================
// TIME PARSER
// =====================================================

function parseClock(value) {
  const match = /^([0-1]?\d):([0-5]\d)\s*(AM|PM)$/i.exec(str(value));

  if (!match) return null;

  const hour = Number(match[1]);

  if (hour < 1 || hour > 12) {
    return null;
  }

  const hour24 = (hour % 12) + (upper(match[3]) === "PM" ? 12 : 0);

  return hour24 * 60 + Number(match[2]);
}

// =====================================================
// VALID DATE
// =====================================================

function validISODate(value) {
  const date = str(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
}

// =====================================================
// VALIDATE 3 PREFERRED VISIT SLOTS
// =====================================================

function validatePreferredSlots(raw) {
  if (!Array.isArray(raw) || raw.length !== 3) {
    return {
      error: "Choose exactly 3 preferred visit time slots.",
    };
  }

  const now = istNow();

  const parsed = [];
  const seen = new Set();

  for (const [index, item] of raw.entries()) {
    const date = str(item?.date);
    const startTime = str(item?.startTime);
    const endTime = str(item?.endTime);

    const start = parseClock(startTime);
    const end = parseClock(endTime);

    if (!validISODate(date) || date < now.date) {
      return {
        error: "Choose a valid current or future visit date.",
      };
    }

    if (start === null || end === null || end - start !== 120) {
      return {
        error: "Each preferred visit slot must be exactly 2 hours.",
      };
    }

    // University visit windows

    if (![9 * 60, 11 * 60, 13 * 60, 15 * 60].includes(start)) {
      return {
        error: "Choose one of the available university visit windows.",
      };
    }

    if (date === now.date && start <= now.minute) {
      return {
        error: "Past or already-started time slots cannot be selected.",
      };
    }

    const key = `${date}|${start}|${end}`;

    if (seen.has(key)) {
      return {
        error: "Duplicate visit slots are not allowed.",
      };
    }

    seen.add(key);

    parsed.push({
      preference: index + 1,

      date,
      startTime,
      endTime,

      start,
      end,
    });
  }

  if (new Set(parsed.map((slot) => slot.date)).size !== 1) {
    return {
      error: "All three preferred slots must be on the chosen date.",
    };
  }

  const sorted = [...parsed].sort((a, b) => a.start - b.start);

  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].start < sorted[i - 1].end) {
      return {
        error: "Preferred visit slots must not overlap.",
      };
    }
  }

  return {
    slots: parsed.map(({ preference, date, startTime, endTime }) => ({
      preference,
      date,
      startTime,
      endTime,
    })),
  };
}

// =====================================================
// CREATE COMPLAINT
// =====================================================

const createComplaint = async (req, res) => {
  try {
    const userId = currentUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Login required",
      });
    }

    // ===============================================
    // FETCH STUDENT
    // ===============================================

    const student = await User.findById(userId)
      .select(
        "name role isHosteller hostel roomNumber floor block department departmentBlock",
      )
      .lean();

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    if (upper(student.role) !== "STUDENT") {
      return res.status(403).json({
        success: false,
        message: "Students only",
      });
    }

    const body = req.body || {};

    const area = upper(body.complaintArea);

    if (!["HOSTEL", "DEPARTMENT", "CAMPUS"].includes(area)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complaint area",
      });
    }

    // ===============================================
    // DAY SCHOLAR RESTRICTION
    // ===============================================

    if (!student.isHosteller && area === "HOSTEL") {
      return res.status(403).json({
        success: false,
        message: "Day Scholars cannot register Hostel complaints",
      });
    }

    // ===============================================
    // BASIC VALIDATION
    // ===============================================

    const title = str(body.title);

    const description = str(body.description);

    const issueLocation = str(body.issueLocation);

    if (
      !title ||
      title.length > 150 ||
      description.length < 10 ||
      description.length > 1500
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Provide a title (up to 150 characters) and a description (10-1500 characters)",
      });
    }

    if (!issueLocation || issueLocation.length > 200) {
      return res.status(400).json({
        success: false,
        message: "Exact issue location is required",
      });
    }

    // ===============================================
    // FETCH ADMIN MASTER DATA
    // ===============================================

    const catalog = await loadComplaintFormCatalog();

    // ===============================================
    // VALIDATE ADMIN CATEGORY
    // ===============================================

    const category = catalog.categories.find(
      (item) => normalize(item.name) === normalize(body.category),
    );

    if (!category) {
      return res.status(400).json({
        success: false,
        message: "Please select an active Admin-created Maintenance Category",
      });
    }

    // ===============================================
    // VALIDATE 3 AVAILABLE SLOTS
    // ===============================================

    const visit = validatePreferredSlots(body.preferredVisitSlots);

    if (visit.error) {
      return res.status(400).json({
        success: false,
        message: visit.error,
      });
    }

    // ===============================================
    // VALIDATE LOCATION FROM ADMIN MASTER
    // ===============================================

    let selected = null;

    const selectionKey = str(body.locationKey);

    if (selectionKey) {
      const match = /^(HOSTEL|BLOCK|OTHER):([a-f0-9]{24})$/i.exec(selectionKey);

      if (!match) {
        return res.status(400).json({
          success: false,
          message: "Invalid selected location",
        });
      }

      selected = findSelection(
        catalog,
        upper(match[1]),
        match[2].toLowerCase(),
      );

      if (!selected) {
        return res.status(400).json({
          success: false,
          message: "Selected Admin location is unavailable or archived",
        });
      }
    }

    // ===============================================
    // BUILD SAFE COMPLAINT DATA
    // ===============================================

    const complaintData = {
      title,
      description,

      category: category.name,

      subCategory: str(body.subCategory || title).slice(0, 150),

      // Admin controls the priority
      priority: category.priority,

      complaintArea: area,
      issueLocation,

      preferredVisitSlots: visit.slots,

      // Backward compatibility
      // This is a preferred time, not
      // a confirmed appointment.
      availableFrom: visit.slots[0].startTime,

      availableTo: visit.slots[0].endTime,

      hostel: "",
      block: "",
      roomNumber: "",
      floor: "",
      assignedDepartment: "",

      image: typeof body.image === "string" ? body.image : "",
    };

    // ===============================================
    // HOSTEL COMPLAINT
    // ===============================================

    if (area === "HOSTEL") {
      const hostel =
        selected ||
        catalog.hostels.find((item) => matchesHostel(item, student.hostel));

      if (
        !hostel ||
        hostel.type !== "HOSTEL" ||
        !matchesHostel(hostel, student.hostel)
      ) {
        return res.status(403).json({
          success: false,
          message: "Only your registered, active Hostel can be selected",
        });
      }

      const room = str(student.roomNumber);

      if (!room) {
        return res.status(400).json({
          success: false,
          message: "Room number is missing from your Student Profile",
        });
      }

      complaintData.hostel = str(student.hostel) || hostel.name;

      complaintData.roomNumber = room;

      complaintData.floor = detectHostelFloor(room) || str(student.floor);

      complaintData.block = str(student.block);
    }

    // ===============================================
    // ACADEMIC BLOCK COMPLAINT
    // ===============================================
    else if (area === "DEPARTMENT") {
      const rawBlock = normalize(body.block).replace(/^BLOCK/, "");

      const block =
        selected ||
        catalog.academicBlocks.find(
          (item) =>
            normalize(item.code) === rawBlock ||
            normalize(item.name) === normalize(body.block),
        );

      if (!block || block.type !== "BLOCK") {
        return res.status(400).json({
          success: false,
          message: "Select an active Academic Block created by Admin",
        });
      }

      complaintData.block = block.code;

      complaintData.assignedDepartment =
        typeof student.department === "string"
          ? student.department
          : str(student.department?.departmentName || student.department?.name);
    }

    // ===============================================
    // ADMIN OTHER LOCATION COMPLAINT
    // ===============================================
    else if (area === "CAMPUS") {
      const other =
        selected ||
        catalog.otherLocations.find((item) =>
          normalize(issueLocation).startsWith(normalize(item.name)),
        );

      if (!other || other.type !== "OTHER") {
        return res.status(400).json({
          success: false,
          message: "Select an active Other Location created by Admin",
        });
      }

      if (other.areas.length > 0) {
        const prefix = `${other.name} - `;

        const given = issueLocation
          .toLowerCase()
          .startsWith(prefix.toLowerCase())
          ? issueLocation.slice(prefix.length)
          : issueLocation;

        const known = other.areas.find(
          (item) => normalize(item) === normalize(given),
        );

        if (!known) {
          return res.status(400).json({
            success: false,
            message: "Select an Admin-created area inside the Other Location",
          });
        }

        complaintData.issueLocation = `${other.name} - ${known}`;
      } else {
        complaintData.issueLocation = other.name;
      }
    }

    // ===============================================
    // HINDI AUTO TRANSLATION
    // ===============================================

    let titleHindi = "";
    let descriptionHindi = "";

    const results = await Promise.allSettled([
      translate(title, {
        to: "hi",
      }),

      translate(description, {
        to: "hi",
      }),
    ]);

    if (results[0].status === "fulfilled") {
      titleHindi = str(results[0].value);
    }

    if (results[1].status === "fulfilled") {
      descriptionHindi = str(results[1].value);
    }

    if (technicalTerms[title]) {
      titleHindi = technicalTerms[title];
    }

    // ===============================================
    // COMPLAINT DEADLINE
    // ===============================================

    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // ===============================================
    // PREPARE DATABASE DOCUMENT
    // ===============================================

    const commonData = {
      ...complaintData,

      titleHindi,
      descriptionHindi,

      status: "PENDING",

      student: userId,
      createdBy: userId,

      deadline,

      statusHistory: [
        {
          status: "PENDING",
          changedBy: userId,
          changedAt: new Date(),
        },
      ],
    };

    // ===============================================
    // CREATE UNIQUE COMPLAINT ID
    // ===============================================

    let complaint;

    for (let tries = 0; tries < 5; tries += 1) {
      try {
        complaint = await Complaint.create({
          ...commonData,

          complaintId: `CMP-${crypto.randomInt(100000, 1000000)}`,
        });

        break;
      } catch (error) {
        if (error.code !== 11000 || tries === 4) {
          throw error;
        }
      }
    }

    // ===============================================
    // STUDENT NOTIFICATION
    // ===============================================

    await safeSendNotification({
      receiver: userId,
      sender: userId,

      title: "Complaint Submitted",

      message:
        `${complaint.complaintId} (${complaint.title}) ` +
        "was submitted successfully. Your preferred visit " +
        "times are awaiting Manager selection.",

      type: "COMPLAINT",

      priority: getNotificationPriority(complaint.priority),

      relatedComplaint: complaint._id,

      relatedId: complaint._id,

      relatedModel: "Complaint",

      actionUrl: "/complaints",
    });

    // ===============================================
    // MAINTENANCE MANAGER NOTIFICATIONS
    // ===============================================

    const managers = await User.find({
      role: "MAINTENANCE_MANAGER",

      isActive: {
        $ne: false,
      },
    }).select("_id");

    await Promise.allSettled(
      managers.map((manager) =>
        safeSendNotification({
          receiver: manager._id,
          sender: userId,

          title: "New Maintenance Complaint",

          message:
            `${student.name || "Student"} submitted ` +
            `${complaint.complaintId}: ${complaint.title}. ` +
            "Three visit preferences require scheduling.",

          type: "COMPLAINT",

          priority: getNotificationPriority(complaint.priority),

          relatedComplaint: complaint._id,

          relatedId: complaint._id,

          relatedModel: "Complaint",

          actionUrl: "/maintenance/dashboard",
        }),
      ),
    );

    return res.status(201).json({
      success: true,

      message: "Complaint submitted successfully",

      complaint,
    });
  } catch (error) {
    console.error("CREATE COMPLAINT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to submit complaint. Please retry.",
    });
  }
};

// =====================================================
// GET ALL COMPLAINTS
// =====================================================

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
    console.error("GET ALL COMPLAINTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load complaints",
    });
  }
};

// =====================================================
// GET MY COMPLAINTS
// =====================================================

const getMyComplaints = async (req, res) => {
  try {
    const userId = currentUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Login required",
      });
    }

    const complaints = await Complaint.find({
      createdBy: userId,
    })
      .populate("assignedTo", "name email phone department status")
      .sort({
        createdAt: -1,
      });

    return res.status(200).json({
      success: true,
      complaints,
    });
  } catch (error) {
    console.error("GET MY COMPLAINTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load complaints",
    });
  }
};

// =====================================================
// GET SINGLE COMPLAINT
// =====================================================

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

    if (
      upper(req.user?.role) === "STUDENT" &&
      String(complaint.student) !== String(currentUserId(req))
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    return res.status(200).json({
      success: true,
      complaint,
    });
  } catch (error) {
    console.error("GET COMPLAINT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load complaint",
    });
  }
};

// =====================================================
// UPDATE COMPLAINT STATUS
// =====================================================

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

    const newStatus = upper(req.body?.status || oldStatus);

    const validStatuses = Complaint.schema.path("status")?.enumValues || [];

    if (!validStatuses.includes(newStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complaint status",
      });
    }

    complaint.status = newStatus;

    if (typeof req.body?.remarks === "string") {
      complaint.remarks = str(req.body.remarks);
    }

    if (oldStatus !== newStatus) {
      complaint.statusHistory.push({
        status: newStatus,

        changedAt: new Date(),

        changedBy: currentUserId(req),
      });
    }

    // ===============================================
    // CLOSE
    // ===============================================

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

    await complaint.save();

    // ===============================================
    // STUDENT NOTIFICATION
    // ===============================================

    if (oldStatus !== newStatus && complaint.createdBy) {
      const notification = getStatusNotification(newStatus, complaint);

      await safeSendNotification({
        receiver: complaint.createdBy,

        sender: currentUserId(req),

        title: notification.title,

        message: notification.message,

        type: "STATUS_UPDATE",

        priority: getNotificationPriority(complaint.priority),

        relatedComplaint: complaint._id,

        relatedId: complaint._id,

        relatedModel: "Complaint",

        actionUrl: "/complaints",
      });
    }

    return res.status(200).json({
      success: true,

      message: "Complaint updated successfully",

      complaint,
    });
  } catch (error) {
    console.error("UPDATE COMPLAINT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update complaint",
    });
  }
};

// =====================================================
// LEGACY ASSIGN COMPLAINT ROUTE
// Main Technician Assignment remains in workerController.
// =====================================================

const assignComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    const worker = await User.findById(req.body?.assignedTo);

    if (!worker || !["TECHNICIAN", "WORKER"].includes(upper(worker.role))) {
      return res.status(404).json({
        success: false,
        message: "Technician not found",
      });
    }

    if (
      worker.isActive === false ||
      ["OFFLINE", "ON_LEAVE"].includes(upper(worker.status))
    ) {
      return res.status(400).json({
        success: false,
        message: "Technician is unavailable",
      });
    }

    if (normalize(worker.department) !== normalize(complaint.category)) {
      return res.status(400).json({
        success: false,
        message: "Technician category does not match complaint",
      });
    }

    if (complaint.assignedTo) {
      return res.status(409).json({
        success: false,

        message:
          "Complaint is already assigned. Use the Manager reassignment flow.",
      });
    }

    if ((worker.currentJobs || 0) >= (worker.maxJobs || 10)) {
      return res.status(400).json({
        success: false,

        message: "Technician workload limit reached",
      });
    }

    // ===============================================
    // SAVE ASSIGNMENT
    // ===============================================

    complaint.assignedTo = worker._id;

    complaint.assignedBy = currentUserId(req);

    complaint.workerAssigned = true;

    complaint.status = "ASSIGNED";

    complaint.statusHistory.push({
      status: "ASSIGNED",

      changedAt: new Date(),

      changedBy: currentUserId(req),
    });

    worker.currentJobs = (worker.currentJobs || 0) + 1;

    worker.status =
      worker.currentJobs >= (worker.maxJobs || 10) ? "BUSY" : "ACTIVE";

    await worker.save();
    await complaint.save();

    // ===============================================
    // TECHNICIAN AND STUDENT NOTIFICATIONS
    // ===============================================

    await Promise.allSettled([
      safeSendNotification({
        receiver: worker._id,

        sender: currentUserId(req),

        title: "New Complaint Assigned",

        message: `${complaint.complaintId} has been assigned to you.`,

        type: "WORKER_ASSIGN",

        priority: getNotificationPriority(complaint.priority),

        relatedComplaint: complaint._id,

        relatedId: complaint._id,

        relatedModel: "Complaint",

        actionUrl: "/technician/dashboard",
      }),

      safeSendNotification({
        receiver: complaint.createdBy,

        sender: currentUserId(req),

        title: "Technician Assigned",

        message: `${worker.name || "Technician"} has been assigned to ${
          complaint.complaintId
        }.`,

        type: "STATUS_UPDATE",

        priority: getNotificationPriority(complaint.priority),

        relatedComplaint: complaint._id,

        relatedId: complaint._id,

        relatedModel: "Complaint",

        actionUrl: "/complaints",
      }),
    ]);

    return res.status(200).json({
      success: true,

      message: "Complaint assigned successfully",

      complaint,
    });
  } catch (error) {
    console.error("ASSIGN COMPLAINT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to assign complaint",
    });
  }
};

// =====================================================
// REOPEN COMPLAINT
// =====================================================

const reopenComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    const reason = str(req.body?.reason);

    if (reason.length < 5) {
      return res.status(400).json({
        success: false,

        message: "Please explain why repair is not resolved",
      });
    }

    if (
      upper(req.user?.role) === "STUDENT" &&
      String(complaint.createdBy) !== String(currentUserId(req))
    ) {
      return res.status(403).json({
        success: false,

        message: "You cannot reopen another student's complaint",
      });
    }

    complaint.status = "REOPENED";

    complaint.reopenCount = (complaint.reopenCount || 0) + 1;

    complaint.reopenReason = reason;

    complaint.statusHistory.push({
      status: "REOPENED",

      changedAt: new Date(),

      changedBy: currentUserId(req),
    });

    await complaint.save();

    // ===============================================
    // NOTIFY STUDENT, TECHNICIAN AND MANAGER
    // ===============================================

    const recipients = [complaint.createdBy, complaint.assignedTo].filter(
      Boolean,
    );

    const managers = await User.find({
      role: "MAINTENANCE_MANAGER",

      isActive: {
        $ne: false,
      },
    }).select("_id");

    recipients.push(...managers.map((manager) => manager._id));

    await Promise.allSettled(
      [...new Set(recipients.map(String))].map((receiver) =>
        safeSendNotification({
          receiver,

          sender: currentUserId(req),

          title: "Complaint Reopened",

          message: `${complaint.complaintId} was reopened. Reason: ${reason}`,

          type: "REOPEN",

          priority: getNotificationPriority(complaint.priority),

          relatedComplaint: complaint._id,

          relatedId: complaint._id,

          relatedModel: "Complaint",

          actionUrl: "/complaints",
        }),
      ),
    );

    return res.status(200).json({
      success: true,

      message: "Complaint reopened",

      complaint,
    });
  } catch (error) {
    console.error("REOPEN COMPLAINT ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Unable to reopen complaint",
    });
  }
};

// =====================================================
// GET ADMIN-CREATED CATEGORIES FOR STUDENT
// =====================================================

const getCategoriesForStudents = async (req, res) => {
  try {
    const categories = await Category.find({
      department: "MAINTENANCE",

      isActive: {
        $ne: false,
      },

      isDeleted: {
        $ne: true,
      },
    })
      .select("categoryName subCategories priority icon description")
      .sort({
        categoryName: 1,
      })
      .lean();

    return res.status(200).json({
      success: true,
      categories,
    });
  } catch (error) {
    console.error("STUDENT CATEGORIES ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Unable to load categories",
    });
  }
};

// =====================================================
// EXPORTS — ALL EXISTING ROUTE HANDLERS PRESERVED
// =====================================================

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
