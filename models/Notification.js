const mongoose = require("mongoose");

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
    // STATUS
    // ==========================================

    isRead: {
      type: Boolean,
      default: false,
    },

    isPermanent: {
      type: Boolean,
      default: false,
    },

    // ==========================================
    // RELATED DATA
    // ==========================================

    relatedComplaint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Complaint",
      default: null,
    },

    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    relatedModel: {
      type: String,
      default: null,
    },

    // ==========================================
    // FRONTEND REDIRECT
    // ==========================================

    actionUrl: {
      type: String,
      default: "/dashboard",
    },

    // ==========================================
    // AUTO DELETE
    // ==========================================

    expiresAt: {
      type: Date,

      default: function () {
        return this.isPermanent
          ? null
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      },
    },
  },

  {
    timestamps: true,
  },
);

// ==========================================
// TTL INDEX (AUTO DELETE AFTER 7 DAYS)
// ==========================================

notificationSchema.index(
  { expiresAt: 1 },

  { expireAfterSeconds: 0 },
);
// ==========================================
// REMOVE expiresAt FOR PERMANENT NOTIFICATIONS
// ==========================================

// ==========================================
// REMOVE expiresAt FOR PERMANENT NOTIFICATIONS
// ==========================================

notificationSchema.pre(
  "save",

  function () {
    if (this.isPermanent) {
      this.expiresAt = null;
    }
  },
);
module.exports = mongoose.model(
  "Notification",

  notificationSchema,
);
