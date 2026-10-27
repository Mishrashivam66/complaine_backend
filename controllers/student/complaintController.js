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

const text = (value) => String(value ?? "").trim();

const upper = (value) => text(value).toUpperCase();

const normalize = (value) => upper(value).replace(/[^A-Z0-9]/g, "");

const userId = (req) => req.user?._id || req.user?.id;

// =====================================================
// TECHNICAL TERMS FOR HINDI TRANSLATION
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
// NOTIFICATION HELPERS
// =====================================================

const notificationPriority = (value) => {
  const priority = upper(value);

  if (priority === "URGENT") {
    return "CRITICAL";
  }

  if (["LOW", "MEDIUM", "HIGH"].includes(priority)) {
    return priority;
  }

  return "MEDIUM";
};

async function notify(data) {
  try {
    await sendNotification(data);
  } catch (error) {
    console.error("COMPLAINT NOTIFICATION ERROR:", error.message);
  }
}

function notice(
  receiver,
  sender,
  complaint,
  title,
  message,
  type = "COMPLAINT",
  actionUrl = "/complaints",
) {
  return notify({
    receiver,
    sender,
    title,
    message,
    type,
    priority: notificationPriority(complaint.priority),
    relatedComplaint: complaint._id,
    relatedId: complaint._id,
    relatedModel: "Complaint",
    actionUrl,
  });
}

// =====================================================
// VALID COMPLAINT STATUSES
// =====================================================

const statuses = [
  "PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_MATERIAL",
  "COMPLETED",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
];

// =====================================================
// HOSTEL FLOOR AUTO DETECTION
//
// G    => Ground Floor
// F    => First Floor
// S2   => Second Floor
// S3   => Second Floor (as per university rule)
// =====================================================

function detectFloor(roomNumber) {
  const room = normalize(roomNumber);

  if (room.startsWith("G")) {
    return "Ground Floor";
  }

  if (room.startsWith("F")) {
    return "First Floor";
  }

  if (/^S[23]/.test(room)) {
    return "Second Floor";
  }

  return "";
}

// =====================================================
// HOSTEL NAME NORMALIZATION
//
// H1
// Hostel H1
// Boys Hostel H1
//
// These should refer to the same hostel.
// =====================================================

function normalizeHostel(value) {
  const raw =
    value && typeof value === "object"
      ? value.hostelCode || value.hostelName || value.name || value._id || ""
      : value;

  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^(BOYS|GIRLS|FACULTY|STAFF)?HOSTEL/, "");
}

function hostelMatches(hostel, registeredHostel) {
  const studentHostel = normalizeHostel(registeredHostel);

  if (!studentHostel) {
    return false;
  }

  return [hostel.id, hostel.code, hostel.name].some(
    (value) => normalizeHostel(value) === studentHostel,
  );
}

// =====================================================
// INDIAN STANDARD TIME
// =====================================================

function getIST() {
  const parts = Object.fromEntries(
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
    date: `${parts.year}-${parts.month}-${parts.day}`,

    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

// =====================================================
// CONVERT TIME TO MINUTES
// =====================================================

function minutesFromClock(value) {
  const match = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/i.exec(text(value));

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = upper(match[3]);

  const hour24 = (hour % 12) + (period === "PM" ? 12 : 0);

  return hour24 * 60 + minute;
}

// =====================================================
// VALIDATE ISO DATE
// =====================================================

function validDay(value) {
  const dateText = text(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return false;
  }

  const date = new Date(`${dateText}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === dateText
  );
}

// =====================================================
// VALIDATE THREE PREFERRED VISIT SLOTS
//
// Exactly 3 slots
// Each slot 2 hours
// Same date
// No duplicates
// No past slots
// =====================================================

function validateSlots(value) {
  if (!Array.isArray(value) || value.length !== 3) {
    return {
      error: "Select exactly three preferred 2-hour visit slots",
    };
  }

  const now = getIST();
  const used = new Set();
  const slots = [];

  const allowedStarts = new Set([
    540, // 09:00 AM
    660, // 11:00 AM
    780, // 01:00 PM
    900, // 03:00 PM
  ]);

  let sharedDate = "";

  for (const [index, raw] of value.entries()) {
    const date = text(raw?.date);
    const from = text(raw?.startTime);
    const to = text(raw?.endTime);

    const start = minutesFromClock(from);
    const end = minutesFromClock(to);

    // Validate date
    if (
      !validDay(date) ||
      date < now.date ||
      (sharedDate && sharedDate !== date)
    ) {
      return {
        error: "All three slots must use one valid current or future date",
      };
    }

    sharedDate = date;

    // Validate 2-hour time windows
    if (
      start === null ||
      end === null ||
      end - start !== 120 ||
      !allowedStarts.has(start)
    ) {
      return {
        error: "Choose valid 2-hour slots between 9 AM and 5 PM",
      };
    }

    // Reject started or past windows
    if (date === now.date && start <= now.minutes) {
      return {
        error: "A preferred slot has already started. Choose a later date",
      };
    }

    const key = `${date}:${start}`;

    if (used.has(key)) {
      return {
        error: "Duplicate preferred slots are not allowed",
      };
    }

    used.add(key);

    slots.push({
      preference: index + 1,
      date,
      startTime: from,
      endTime: to,
    });
  }

  return {
    slots,
  };
}

// =====================================================
// SAFE HINDI TRANSLATION
// =====================================================

async function translateSafe(value) {
  try {
    const result = await translate(value, {
      to: "hi",
    });

    return text(result);
  } catch (error) {
    console.warn("TRANSLATION WARNING:", error.message);

    return "";
  }
}

// =====================================================
// CREATE COMPLAINT
// =====================================================

async function createComplaint(req, res) {
  try {
    const creatorId = userId(req);

    // ===============================================
    // AUTHENTICATION
    // ===============================================

    if (!creatorId) {
      return res.status(401).json({
        success: false,
        message: "Login required",
      });
    }

    // ===============================================
    // FETCH STUDENT PROFILE
    // ===============================================

    const student = await User.findById(creatorId)
      .select(
        "name role isHosteller hostel roomNumber floor block department departmentBlock",
      )
      .lean();

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    if (upper(student.role) !== "STUDENT") {
      return res.status(403).json({
        success: false,
        message: "Student access only",
      });
    }

    const body = req.body || {};

    // ===============================================
    // VALIDATE ADMIN LOCATION KEY
    // ===============================================

    const match = /^(HOSTEL|BLOCK|OTHER):([a-f\d]{24})$/i.exec(
      text(body.locationKey),
    );

    if (!match) {
      return res.status(400).json({
        success: false,
        message: "Select an Admin-created complaint location",
      });
    }

    const type = upper(match[1]);

    const locationId = match[2].toLowerCase();

    // ===============================================
    // MAP LOCATION TO EXISTING COMPLAINT AREA
    // ===============================================

    const area =
      type === "HOSTEL" ? "HOSTEL" : type === "BLOCK" ? "DEPARTMENT" : "CAMPUS";

    if (body.complaintArea && upper(body.complaintArea) !== area) {
      return res.status(400).json({
        success: false,
        message: "Complaint area does not match location",
      });
    }

    // ===============================================
    // DAY SCHOLAR HOSTEL RESTRICTION
    // ===============================================

    if (type === "HOSTEL" && student.isHosteller !== true) {
      return res.status(403).json({
        success: false,
        message: "Day scholars cannot submit hostel complaints",
      });
    }

    // ===============================================
    // FETCH ADMIN MASTER DATA
    // ===============================================

    const catalog = await loadComplaintFormCatalog();

    const lists = {
      HOSTEL: catalog.hostels,
      BLOCK: catalog.academicBlocks,
      OTHER: catalog.otherLocations,
    };

    const place = (lists[type] || []).find((item) => item.id === locationId);

    if (!place) {
      return res.status(400).json({
        success: false,
        message: "Location is not active in Admin master",
      });
    }

    // ===============================================
    // CATEGORY FROM ADMIN
    // ===============================================

    const category = catalog.categories.find(
      (item) => normalize(item.name) === normalize(body.category),
    );

    if (!category) {
      return res.status(400).json({
        success: false,
        message: "Select an active Admin-created maintenance category",
      });
    }

    // ===============================================
    // BASIC COMPLAINT VALIDATION
    // ===============================================

    const title = text(body.title);
    const description = text(body.description);
    const rawIssue = text(body.issueLocation);

    if (
      !title ||
      title.length > 150 ||
      description.length < 10 ||
      description.length > 1500 ||
      !rawIssue ||
      rawIssue.length > 200
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Title, description (10–1500 characters) and issue location are required",
      });
    }

    const subCategory = text(body.subCategory || title);

    if (subCategory.length > 150) {
      return res.status(400).json({
        success: false,
        message: "Subcategory is too long",
      });
    }

    // ===============================================
    // VALIDATE 3 VISIT SLOTS
    // ===============================================

    const slotResult = validateSlots(body.preferredVisitSlots);

    if (slotResult.error) {
      return res.status(400).json({
        success: false,
        message: slotResult.error,
      });
    }

    // ===============================================
    // SAFE COMPLAINT DATA
    // ===============================================

    const data = {
      title,
      description,
      subCategory,

      category: category.name,

      // Priority always comes from Admin
      priority: category.priority,

      complaintArea: area,
      issueLocation: rawIssue,

      hostel: "",
      block: "",
      roomNumber: "",
      floor: "",
      assignedDepartment: "",

      preferredVisitSlots: slotResult.slots,

      // Legacy fields for older pages
      availableFrom: slotResult.slots[0].startTime,

      availableTo: slotResult.slots[0].endTime,
    };

    // ===============================================
    // HOSTEL COMPLAINT
    // ===============================================

    if (type === "HOSTEL") {
      if (!hostelMatches(place, student.hostel)) {
        return res.status(403).json({
          success: false,
          message: "Only your registered Hostel can be selected",
        });
      }

      if (!text(student.roomNumber)) {
        return res.status(400).json({
          success: false,
          message: "Your Student profile has no room number",
        });
      }

      data.hostel = text(student.hostel);

      data.roomNumber = text(student.roomNumber);

      data.floor = detectFloor(student.roomNumber) || text(student.floor);

      data.block = text(student.block);
    }

    // ===============================================
    // ACADEMIC BLOCK COMPLAINT
    // ===============================================
    else if (type === "BLOCK") {
      data.block = place.code;

      data.assignedDepartment =
        typeof student.department === "string"
          ? text(student.department)
          : text(
              student.department?.departmentName || student.department?.name,
            );
    }

    // ===============================================
    // OTHER LOCATION COMPLAINT
    // ===============================================
    else {
      if (Array.isArray(place.areas) && place.areas.length) {
        const prefix = `${place.name} - `;

        const selectedArea = rawIssue
          .toLowerCase()
          .startsWith(prefix.toLowerCase())
          ? rawIssue.slice(prefix.length).trim()
          : rawIssue;

        const validArea = place.areas.find(
          (name) => normalize(name) === normalize(selectedArea),
        );

        if (!validArea) {
          return res.status(400).json({
            success: false,
            message: "Select the area created by Admin inside this location",
          });
        }

        data.issueLocation = `${place.name} - ${validArea}`;
      } else {
        data.issueLocation = place.name;
      }
    }

    // ===============================================
    // HINDI AUTO TRANSLATION
    // ===============================================

    const [translatedTitle, translatedDescription] = await Promise.all([
      translateSafe(title),
      translateSafe(description),
    ]);

    const term = Object.keys(technicalTerms).find(
      (key) => upper(key) === upper(title),
    );

    // ===============================================
    // PREPARE COMPLAINT DOCUMENT
    // ===============================================

    const common = {
      ...data,

      titleHindi: term ? technicalTerms[term] : translatedTitle,

      descriptionHindi: translatedDescription,

      status: "PENDING",

      createdBy: creatorId,
      student: creatorId,

      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),

      statusHistory: [
        {
          status: "PENDING",
          changedBy: creatorId,
          changedAt: new Date(),
        },
      ],
    };

    // ===============================================
    // CREATE UNIQUE COMPLAINT ID
    // ===============================================

    let complaint;

    for (let tries = 0; tries < 5; tries++) {
      try {
        complaint = await Complaint.create({
          ...common,

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

    await notify({
      receiver: creatorId,
      sender: creatorId,

      title: "Complaint Submitted",

      message:
        `${complaint.complaintId} submitted. ` +
        "The Manager will choose a visit slot.",

      type: "COMPLAINT",

      priority: notificationPriority(complaint.priority),

      relatedComplaint: complaint._id,

      relatedId: complaint._id,

      relatedModel: "Complaint",

      actionUrl: "/complaints",
    });

    // ===============================================
    // MAINTENANCE MANAGER NOTIFICATION
    // ===============================================

    try {
      const managers = await User.find({
        role: "MAINTENANCE_MANAGER",
        isActive: { $ne: false },
      }).select("_id");

      await Promise.allSettled(
        managers.map((manager) =>
          notice(
            manager._id,
            creatorId,
            complaint,

            "New Maintenance Complaint",

            `${student.name || "Student"} submitted ` +
              `${complaint.complaintId} (${title}). ` +
              "Select a preferred visit slot.",

            "COMPLAINT",

            "/maintenance/dashboard",
          ),
        ),
      );
    } catch (error) {
      console.error("MANAGER NOTIFICATION LOOKUP:", error.message);
    }

    return res.status(201).json({
      success: true,
      message: "Complaint submitted successfully",
      complaint,
    });
  } catch (error) {
    console.error("CREATE COMPLAINT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to submit complaint",
    });
  }
}

// =====================================================
// GET ALL COMPLAINTS
// =====================================================

async function getAllComplaints(req, res) {
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
      message: error.message,
    });
  }
}

// =====================================================
// GET MY COMPLAINTS
// =====================================================

async function getMyComplaints(req, res) {
  try {
    const complaints = await Complaint.find({
      createdBy: userId(req),
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
      message: error.message,
    });
  }
}

// =====================================================
// GET COMPLAINT BY ID
// =====================================================

async function getComplaintById(req, res) {
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

    // Students can only see their own complaints
    if (
      upper(req.user?.role) === "STUDENT" &&
      text(complaint.student?._id || complaint.student) !== text(userId(req))
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
    console.error("GET COMPLAINT BY ID ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

// =====================================================
// UPDATE COMPLAINT STATUS
// =====================================================

async function updateComplaintStatus(req, res) {
  try {
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    const next = upper(req.body?.status || complaint.status);

    if (!statuses.includes(next)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complaint status",
      });
    }

    const old = complaint.status;

    complaint.status = next;

    if (typeof req.body?.remarks === "string") {
      complaint.remarks = text(req.body.remarks);
    }

    if (next !== old) {
      complaint.statusHistory.push({
        status: next,
        changedBy: userId(req),
        changedAt: new Date(),
      });
    }

    // ===============================================
    // CLOSE COMPLAINT
    // ===============================================

    if (next === "CLOSED" && old !== "CLOSED") {
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

    if (next !== old && complaint.createdBy) {
      await notice(
        complaint.createdBy,
        userId(req),
        complaint,

        `Complaint ${next.replace(/_/g, " ")}`,

        `${complaint.complaintId} status changed to ${next}.`,

        "STATUS_UPDATE",
      );
    }

    return res.status(200).json({
      success: true,
      message: "Complaint updated successfully",
      complaint,
    });
  } catch (error) {
    console.error("UPDATE COMPLAINT STATUS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

// =====================================================
// ASSIGN COMPLAINT
// Legacy route — Manager main assignment logic
// remains in workerController.
// =====================================================

async function assignComplaint(req, res) {
  try {
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    if (complaint.assignedTo) {
      return res.status(409).json({
        success: false,
        message: "Complaint already assigned; use reassignment flow",
      });
    }

    // ===============================================
    // FIND TECHNICIAN
    // ===============================================

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
        message: "Technician unavailable",
      });
    }

    // ===============================================
    // CATEGORY MATCHING
    // ===============================================

    if (normalize(worker.department) !== normalize(complaint.category)) {
      return res.status(400).json({
        success: false,
        message: "Technician category mismatch",
      });
    }

    // ===============================================
    // MAX 10 ACTIVE JOBS
    // ===============================================

    if ((worker.currentJobs || 0) >= 10) {
      return res.status(400).json({
        success: false,
        message: "Technician has 10 active jobs",
      });
    }

    // ===============================================
    // ASSIGN TECHNICIAN
    // ===============================================

    complaint.assignedTo = worker._id;

    complaint.assignedBy = userId(req);

    complaint.workerAssigned = true;

    complaint.status = "ASSIGNED";

    complaint.statusHistory.push({
      status: "ASSIGNED",
      changedBy: userId(req),
      changedAt: new Date(),
    });

    worker.currentJobs = (worker.currentJobs || 0) + 1;

    worker.status = worker.currentJobs >= 10 ? "BUSY" : "ACTIVE";

    await worker.save();
    await complaint.save();

    // ===============================================
    // STUDENT + TECHNICIAN NOTIFICATIONS
    // ===============================================

    await Promise.allSettled([
      notice(
        worker._id,
        userId(req),
        complaint,

        "New Complaint Assigned",

        `${complaint.complaintId} has been assigned to you.`,

        "WORKER_ASSIGN",

        "/technician/dashboard",
      ),

      notice(
        complaint.createdBy,
        userId(req),
        complaint,

        "Technician Assigned",

        `${worker.name || "Technician"} was assigned to ${complaint.complaintId}.`,

        "STATUS_UPDATE",
      ),
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
      message: error.message,
    });
  }
}

// =====================================================
// REOPEN COMPLAINT
// =====================================================

async function reopenComplaint(req, res) {
  try {
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    // ===============================================
    // STUDENT OWNERSHIP CHECK
    // ===============================================

    if (
      upper(req.user?.role) === "STUDENT" &&
      text(complaint.createdBy) !== text(userId(req))
    ) {
      return res.status(403).json({
        success: false,
        message: "Cannot reopen another student's complaint",
      });
    }

    const reason = text(req.body?.reason);

    if (reason.length < 5) {
      return res.status(400).json({
        success: false,
        message: "Please provide a reopen reason (minimum 5 characters)",
      });
    }

    // ===============================================
    // SAVE REOPEN DETAILS
    // ===============================================

    complaint.status = "REOPENED";

    complaint.reopenCount = (complaint.reopenCount || 0) + 1;

    complaint.reopenReason = reason;

    complaint.statusHistory.push({
      status: "REOPENED",
      changedBy: userId(req),
      changedAt: new Date(),
    });

    await complaint.save();

    // ===============================================
    // NOTIFY RELEVANT USERS
    // ===============================================

    const managers = await User.find({
      role: "MAINTENANCE_MANAGER",
      isActive: { $ne: false },
    }).select("_id");

    const recipients = [
      ...new Set(
        [
          complaint.createdBy,
          complaint.assignedTo,
          ...managers.map((manager) => manager._id),
        ]
          .filter(Boolean)
          .map(String),
      ),
    ];

    await Promise.allSettled(
      recipients.map((receiver) =>
        notice(
          receiver,
          userId(req),
          complaint,

          "Complaint Reopened",

          `${complaint.complaintId} reopened. Reason: ${reason}`,

          "REOPEN",

          receiver === text(complaint.assignedTo)
            ? "/technician/dashboard"
            : "/complaints",
        ),
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
      message: error.message,
    });
  }
}

// =====================================================
// GET ADMIN-CREATED MAINTENANCE CATEGORIES
// =====================================================

async function getCategoriesForStudents(req, res) {
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
    console.error("GET STUDENT CATEGORIES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load categories",
    });
  }
}

// =====================================================
// EXPORT ALL EXISTING ROUTE HANDLERS
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
