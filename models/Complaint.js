const mongoose = require("mongoose");

// ==========================================
// COMPLAINT SCHEMA
// ==========================================

const complaintSchema = new mongoose.Schema(
  {
    // ==========================================
    // COMPLAINT ID
    // ==========================================

    complaintId: {
      type: String,

      unique: true,
    },

    // ==========================================
    // BASIC DETAILS
    // ==========================================

    title: {
      type: String,

      required: true,

      trim: true,
    },

    description: {
      type: String,

      required: true,
    },

    // ==========================================
    // COMPLAINT AREA
    // ==========================================

    complaintArea: {
      type: String,

      enum: ["HOSTEL", "DEPARTMENT", "CAMPUS"],

      default: "HOSTEL",
    },

    // ==========================================
    // DEADLINE
    // ==========================================

    deadline: {
      type: Date,
    },
    floor: {
      type: String,

      default: "",
    },

    // ==========================================
    // WORKER STATUS
    // ==========================================

    workerAssigned: {
      type: Boolean,

      default: false,
    },

    category: {
      type: String,

      required: true,
    },

    // ==========================================
    // SUB CATEGORY
    // ==========================================

    subCategory: {
      type: String,

      default: "",
    },

    // ==========================================
    // PRIORITY
    // ==========================================

    priority: {
      type: String,

      enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],

      default: "MEDIUM",
    },

    // ==========================================
    // STATUS
    // ==========================================

    status: {
      type: String,

      enum: [
        "PENDING",

        "ASSIGNED",

        "IN_PROGRESS",

        "RESOLVED",

        "CLOSED",

        "REOPENED",
      ],

      default: "PENDING",
    },

    // ==========================================
    // ESCALATION
    // ==========================================

    isEscalated: {
      type: Boolean,

      default: false,
    },

    escalationReason: {
      type: String,

      default: "",
    },

    escalatedAt: {
      type: Date,

      default: null,
    },

    // ==========================================
    // WORK START & COMPLETION
    // ==========================================

    startedAt: {
      type: Date,

      default: null,
    },

    resolvedAt: {
      type: Date,

      default: null,
    },

    // ==========================================
    // MAINTENANCE MANAGER
    // ==========================================

    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      default: null,
    },
    assignedDepartment: {
      type: String,

      default: "",
    },

    // ==========================================
    // WORKER REMARKS
    // ==========================================

    workerRemarks: {
      type: String,

      default: "",
    },

    // ==========================================
    // MATERIAL REQUIRED
    // ==========================================

    materialRequired: {
      type: Boolean,

      default: false,
    },
    // ==========================================
    // USER DETAILS
    // ==========================================

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      required: true,
    },

    // ==========================================
    // ASSIGNED WORKER
    // ==========================================

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      default: null,
    },

    // ==========================================
    // HOSTEL DETAILS
    // ==========================================

    hostel: {
      type: String,

      default: "",
    },

    block: {
      type: String,

      default: "",
    },

    roomNumber: {
      type: String,

      default: "",
    },

    // ==========================================
    // ISSUE LOCATION
    // ==========================================

    issueLocation: {
      type: String,

      default: "",
    },

    // ==========================================
    // AVAILABLE TIME
    // ==========================================

    availableFrom: {
      type: String,

      default: "",
    },

    availableTo: {
      type: String,

      default: "",
    },

    // ==========================================
    // IMAGE
    // ==========================================

    image: {
      type: String,

      default: "",
    },

    // ==========================================
    // REMARKS
    // ==========================================

    remarks: {
      type: String,

      default: "",
    },

    // ==========================================
    // REOPEN
    // ==========================================

    reopenCount: {
      type: Number,

      default: 0,
    },

    reopenReason: {
      type: String,

      default: "",
    },

    student: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      required: true,
    },

    // ==========================================
    // CLOSED TIME
    // ==========================================

    closedAt: {
      type: Date,

      default: null,
    },

    statusHistory: [
      {
        status: {
          type: String,
        },

        changedAt: {
          type: Date,

          default: Date.now,
        },

        changedBy: {
          type: mongoose.Schema.Types.ObjectId,

          ref: "User",
        },
      },
    ],
  },

  {
    timestamps: true,
  },
);

// ==========================================
// EXPORT MODEL
// ==========================================

module.exports = mongoose.model(
  "Complaint",

  complaintSchema,
);
