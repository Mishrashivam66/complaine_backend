const mongoose = require("mongoose");

const reopenComplaintSchema = new mongoose.Schema(
  {
    reopenId: {
      type: String,

      unique: true,

      required: true,
    },

    complaint: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "Complaint",

      required: true,
    },

    jobCard: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "JobCard",

      required: true,
    },

    previousWorker: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      required: true,
    },

    reassignedWorker: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      default: null,
    },

    reopenReason: {
      type: String,

      required: true,
    },

    reopenCount: {
      type: Number,

      default: 1,
    },

    priority: {
      type: String,

      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],

      default: "MEDIUM",
    },

    status: {
      type: String,

      enum: ["IN_PROGRESS", "REASSIGNED", "ESCALATED"],

      default: "IN_PROGRESS",
    },

    managerNotes: {
      type: String,

      default: "",
    },

    reopenedAt: {
      type: Date,

      default: Date.now,
    },
  },

  {
    timestamps: true,
  },
);

module.exports = mongoose.model(
  "ReopenComplaint",

  reopenComplaintSchema,
);
