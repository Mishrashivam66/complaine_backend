const Notification = require("../models/Notification");

// ==========================================
// ALLOWED NOTIFICATION TYPES
// ==========================================

const ALLOWED_TYPES = [
  "SYSTEM",
  "COMPLAINT",
  "APPROVAL",
  "JOB_CARD",
  "MATERIAL",
  "INVENTORY",
  "HOSTEL",
  "OVERDUE",
  "HIGH_PRIORITY",
  "ANNOUNCEMENT",

  // OLD / WORKFLOW TYPES
  "WORKER_ASSIGN",
  "STATUS_UPDATE",
  "MATERIAL_REQUEST",
  "MATERIAL_APPROVED",
  "REOPEN",
  "ESCALATION",
];

// ==========================================
// ALLOWED PRIORITIES
// ==========================================

const ALLOWED_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

// ==========================================
// NORMALIZE PRIORITY
// ==========================================

const normalizePriority = (priority) => {
  const normalized = String(priority || "LOW")
    .trim()
    .toUpperCase();

  // Complaint priority URGENT
  // Notification priority CRITICAL
  if (normalized === "URGENT") {
    return "CRITICAL";
  }

  if (ALLOWED_PRIORITIES.includes(normalized)) {
    return normalized;
  }

  return "LOW";
};

// ==========================================
// NORMALIZE TYPE
// ==========================================

const normalizeType = (type) => {
  const normalized = String(type || "SYSTEM")
    .trim()
    .toUpperCase();

  if (ALLOWED_TYPES.includes(normalized)) {
    return normalized;
  }

  return "SYSTEM";
};

// ==========================================
// COMMON SEND NOTIFICATION
// ==========================================

const sendNotification = async ({
  receiver,

  sender = null,

  title,

  message,

  type = "SYSTEM",

  priority = "LOW",

  relatedComplaint = null,

  relatedId = null,

  relatedModel = null,

  actionUrl = "/dashboard",
}) => {
  try {
    // ======================================
    // VALIDATION
    // ======================================

    if (!receiver) {
      console.log("NOTIFICATION ERROR: Receiver is required");

      return null;
    }

    if (!title) {
      console.log("NOTIFICATION ERROR: Title is required");

      return null;
    }

    if (!message) {
      console.log("NOTIFICATION ERROR: Message is required");

      return null;
    }

    // ======================================
    // CREATE NOTIFICATION
    //
    // expiresAt automatically Notification
    // model se +24 hours set hoga
    // ======================================

    const notification = await Notification.create({
      receiver,

      sender,

      title,

      message,

      type: normalizeType(type),

      priority: normalizePriority(priority),

      relatedComplaint,

      relatedId,

      relatedModel,

      actionUrl: actionUrl || "/dashboard",
    });

    // ======================================
    // POPULATE SENDER
    // ======================================

    await notification.populate("sender", "name role profilePhoto");

    console.log(`NOTIFICATION CREATED: ${notification.title} -> ${receiver}`);

    return notification;
  } catch (error) {
    // ======================================
    // IMPORTANT
    //
    // Notification fail hone se
    // complaint/job workflow crash
    // nahi hona chahiye
    // ======================================

    console.log("SEND NOTIFICATION ERROR:", error.message);

    return null;
  }
};

// ==========================================
// EXPORT
// ==========================================

module.exports = sendNotification;
