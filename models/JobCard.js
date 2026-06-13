const mongoose = require("mongoose");

const jobCardSchema = new mongoose.Schema(
  {
    // ==========================================
    // JOB CARD ID
    // ==========================================

    jobCardId: {
      type: String,

      unique: true,

      required: true,
    },

    // ==========================================
    // COMPLAINT
    // ==========================================

    complaint: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "Complaint",

      required: true,
    },

    // ==========================================
    // ASSIGNED WORKER
    // ==========================================

    assignedWorker: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      default: null,
    },

    // ==========================================
    // ASSIGNED BY
    // ==========================================

    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      default: null,
    },

    // ==========================================
    // JOB STATUS
    // ==========================================

    status: {
      type: String,

      enum: ["ASSIGNED", "IN_PROGRESS", "MATERIAL_REQUIRED", "COMPLETED"],

      default: "ASSIGNED",
    },

    // ==========================================
    // WORKER STATUS
    // ==========================================

    workerStatus: {
      type: String,

      enum: ["NOT_STARTED", "WORKING", "WAITING_MATERIAL", "COMPLETED"],

      default: "NOT_STARTED",
    },

    // ==========================================
    // MATERIAL REQUIRED
    // ==========================================

    materialRequired: {
      type: Boolean,

      default: false,
    },

    // ==========================================
    // REMARKS
    // ==========================================

    remarks: {
      type: String,

      default: "",
    },

    // ==========================================
    // WORK DESCRIPTION
    // ==========================================

    workDescription: {
      type: String,

      default: "",
    },

    // ==========================================
    // MATERIALS USED
    // ==========================================

    materialsUsed: [
      {
        itemName: {
          type: String,
        },

        quantity: {
          type: Number,
        },
      },
    ],

    // ==========================================
    // PRIORITY
    // ==========================================

    priority: {
      type: String,

      enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],

      default: "MEDIUM",
    },

    // ==========================================
    // START TIME
    // ==========================================

    startedAt: {
      type: Date,

      default: null,
    },

    // ==========================================
    // COMPLETION TIME
    // ==========================================

    completionTime: {
      type: Date,

      default: null,
    },

    // ==========================================
    // ASSIGNED DATE
    // ==========================================

    assignedDate: {
      type: Date,

      default: Date.now,
    },

    // ==========================================
    // VERIFIED BY STUDENT
    // ==========================================

    studentVerified: {
      type: Boolean,

      default: false,
    },

    // ==========================================
    // VERIFIED DATE
    // ==========================================

    verifiedAt: {
      type: Date,

      default: null,
    },

    // ==========================================
    // RATING
    // ==========================================

    rating: {
      type: Number,

      min: 1,

      max: 5,

      default: null,
    },

    // ==========================================
    // FEEDBACK
    // ==========================================

    feedback: {
      type: String,

      default: "",
    },

    // ==========================================
    // IMAGE
    // ==========================================

    beforeWorkImage: {
      type: String,

      default: "",
    },

    afterWorkImage: {
      type: String,

      default: "",
    },
  },

  {
    timestamps: true,
  },
);

module.exports = mongoose.model("JobCard", jobCardSchema);
