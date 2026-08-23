const mongoose = require("mongoose");

// ==========================================
// NOTIFICATION SCHEMA
// ==========================================

const notificationSchema = new mongoose.Schema(
  {
    // ==========================================
    // BASIC INFO
    // ==========================================

    title: {
      type: String,
      required: true,
      trim: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    // ==========================================
    // RECEIVER & SENDER
    // ==========================================

    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ==========================================
    // NOTIFICATION TYPE
    // ==========================================

    type: {
      type: String,

      enum: [
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

        // OLD TYPES SUPPORT

        "WORKER_ASSIGN",
        "STATUS_UPDATE",
        "MATERIAL_REQUEST",
        "MATERIAL_APPROVED",
        "REOPEN",
        "ESCALATION",
      ],

      default: "SYSTEM",
    },

    // ==========================================
    // PRIORITY
    // ==========================================

    priority: {
      type: String,

      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],

      default: "LOW",
    },

    // ==========================================
    // READ STATUS
    // ==========================================

    isRead: {
      type: Boolean,
      default: false,
    },

    // ==========================================
    // RELATED COMPLAINT
    // ==========================================

    relatedComplaint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Complaint",
      default: null,
    },

    // ==========================================
    // GENERIC RELATED DATA
    // ==========================================

    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    relatedModel: {
      type: String,
      default: null,
      trim: true,
    },

    // ==========================================
    // FRONTEND REDIRECT
    // ==========================================

    actionUrl: {
      type: String,
      default: "/dashboard",
      trim: true,
    },

    // ==========================================
    // AUTO DELETE AFTER 24 HOURS
    // ==========================================

    expiresAt: {
      type: Date,

      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  },

  {
    timestamps: true,
  },
);

// ==========================================
// TTL INDEX
//
// MongoDB will automatically delete
// every notification after expiresAt
// ==========================================

notificationSchema.index(
  {
    expiresAt: 1,
  },

  {
    expireAfterSeconds: 0,
  },
);

// ==========================================
// PERFORMANCE INDEX
// NOTIFICATION + UNREAD COUNT
// ==========================================

notificationSchema.index({
  receiver: 1,
  isRead: 1,
  createdAt: -1,
});

// ==========================================
// NOTIFICATION HISTORY INDEX
// ==========================================

notificationSchema.index({
  receiver: 1,
  createdAt: -1,
});

// ==========================================
// EXPORT
// ==========================================

module.exports = mongoose.model("Notification", notificationSchema);
