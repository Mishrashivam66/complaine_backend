const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,

      required: true,
    },

    message: {
      type: String,

      required: true,
    },

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

    type: {
      type: String,

      enum: [
        "COMPLAINT",

        "WORKER_ASSIGN",

        "STATUS_UPDATE",

        "MATERIAL_REQUEST",

        "MATERIAL_APPROVED",

        "REOPEN",

        "ESCALATION",

        "SYSTEM",
      ],

      default: "SYSTEM",
    },

    isRead: {
      type: Boolean,

      default: false,
    },

    relatedComplaint: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "Complaint",

      default: null,
    },
  },

  {
    timestamps: true,
  },
);

module.exports = mongoose.model(
  "Notification",

  notificationSchema,
);
