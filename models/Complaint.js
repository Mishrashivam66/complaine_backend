"use strict";

const mongoose = require("mongoose");

// =====================================================
// AMI MAINTENANCE
// COMPLAINT MODEL
// =====================================================

const complaintSchema = new mongoose.Schema(
  {
    // =================================================
    // COMPLAINT ID
    // =================================================

    complaintId: {
      type: String,
      unique: true,
    },

    // =================================================
    // BASIC COMPLAINT DETAILS
    // =================================================

    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
    },

    // =================================================
    // HINDI AUTO TRANSLATION
    // =================================================

    titleHindi: {
      type: String,
      default: "",
    },

    descriptionHindi: {
      type: String,
      default: "",
    },

    // =================================================
    // COMPLAINT AREA
    //
    // HOSTEL     - Hostel maintenance
    // DEPARTMENT - Academic blocks
    // CAMPUS     - Other campus locations
    // =================================================

    complaintArea: {
      type: String,
      enum: ["HOSTEL", "DEPARTMENT", "CAMPUS"],
      default: "HOSTEL",
    },

    // =================================================
    // COMPLAINT DEADLINE
    // =================================================

    deadline: {
      type: Date,
    },

    // =================================================
    // FLOOR DETAILS
    // =================================================

    floor: {
      type: String,
      default: "",
    },

    // =================================================
    // WORKER ASSIGNMENT FLAG
    // =================================================

    workerAssigned: {
      type: Boolean,
      default: false,
    },

    // =================================================
    // MAINTENANCE CATEGORY
    // =================================================

    category: {
      type: String,
      required: true,
    },

    // =================================================
    // SUBCATEGORY
    // =================================================

    subCategory: {
      type: String,
      default: "",
    },

    // =================================================
    // PRIORITY
    // =================================================

    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      default: "MEDIUM",
    },

    // =================================================
    // COMPLAINT STATUS
    //
    // PENDING          - Newly submitted
    // ASSIGNED         - Technician assigned
    // IN_PROGRESS      - Work started
    // WAITING_MATERIAL - Material pending
    // COMPLETED        - Technician finished work
    // RESOLVED         - Student accepted repair
    // CLOSED           - Final closure
    // REOPENED         - Further work required
    // =================================================

    status: {
      type: String,

      enum: [
        "PENDING",
        "ASSIGNED",
        "IN_PROGRESS",
        "WAITING_MATERIAL",
        "COMPLETED",
        "RESOLVED",
        "CLOSED",
        "REOPENED",
      ],

      default: "PENDING",
    },

    // =================================================
    // ESCALATION DETAILS
    // =================================================

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

    // =================================================
    // WORK START / COMPLETION / RESOLUTION
    // =================================================

    startedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    resolvedAt: {
      type: Date,
      default: null,
    },

    // =================================================
    // MAINTENANCE MANAGER
    // =================================================

    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    assignedDepartment: {
      type: String,
      default: "",
    },

    // =================================================
    // WORKER REMARKS
    // =================================================

    workerRemarks: {
      type: String,
      default: "",
    },

    // =================================================
    // MATERIAL MANAGEMENT
    // =================================================

    materialRequired: {
      type: Boolean,
      default: false,
    },

    materialDecision: {
      type: String,

      enum: ["PENDING", "REQUIRED", "NOT_REQUIRED"],

      default: "PENDING",
    },

    // =================================================
    // STUDENT / COMPLAINT CREATOR
    // =================================================

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // =================================================
    // ASSIGNED TECHNICIAN / WORKER
    // =================================================

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // =================================================
    // HOSTEL / ACADEMIC BLOCK DETAILS
    // =================================================

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

    // =================================================
    // ISSUE LOCATION
    // =================================================

    issueLocation: {
      type: String,
      default: "",
    },

    // =================================================
    // LEGACY AVAILABLE TIME
    //
    // Kept for compatibility with existing pages.
    // =================================================

    availableFrom: {
      type: String,
      default: "",
    },

    availableTo: {
      type: String,
      default: "",
    },

    // =================================================
    // STUDENT PREFERRED VISIT SLOTS
    //
    // Student selects exactly 3 preferred 2-hour slots.
    //
    // Example:
    // 09:00 AM - 11:00 AM
    // 11:00 AM - 01:00 PM
    // 01:00 PM - 03:00 PM
    // =================================================

    preferredVisitSlots: [
      {
        preference: {
          type: Number,
          min: 1,
          max: 3,
        },

        date: {
          type: String,
          default: "",
        },

        startTime: {
          type: String,
          default: "",
        },

        endTime: {
          type: String,
          default: "",
        },
      },
    ],

    // =================================================
    // MAINTENANCE MANAGER CONFIRMED VISIT
    //
    // Manager selects a visit time.
    // =================================================

    scheduledVisit: {
      date: {
        type: String,
        default: "",
      },

      startTime: {
        type: String,
        default: "",
      },

      endTime: {
        type: String,
        default: "",
      },

      scheduledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },

      scheduledAt: {
        type: Date,
        default: null,
      },
    },

    // =================================================
    // COMPLAINT IMAGE
    // =================================================

    image: {
      type: String,
      default: "",
    },

    // =================================================
    // GENERAL REMARKS
    // =================================================

    remarks: {
      type: String,
      default: "",
    },

    // =================================================
    // STUDENT SATISFACTION VERIFICATION
    //
    // NEW FEATURE
    //
    // SATISFIED:
    // Student accepts the repair.
    // Controller moves status to RESOLVED.
    //
    // NOT_SATISFIED:
    // Student provides a reason.
    // Controller moves status to REOPENED.
    //
    // Only the complaint owner can verify.
    // =================================================

    studentVerification: {
      // Student decision

      decision: {
        type: String,

        enum: ["SATISFIED", "NOT_SATISFIED"],

        default: undefined,
      },

      // Reason required for NOT_SATISFIED.
      // Validation is enforced in the controller.

      reason: {
        type: String,
        trim: true,
        default: "",
        maxlength: 800,
      },

      // Date and time when Student verified

      verifiedAt: {
        type: Date,
        default: null,
      },

      // Student who submitted verification

      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
    },

    // =================================================
    // REOPEN MANAGEMENT
    //
    // Preserve existing reopen functionality.
    // =================================================

    reopenCount: {
      type: Number,
      default: 0,
    },

    reopenReason: {
      type: String,
      default: "",
    },

    // =================================================
    // CLOSED TIME
    // =================================================

    closedAt: {
      type: Date,
      default: null,
    },

    // =================================================
    // COMPLAINT STATUS HISTORY
    //
    // Records all complaint status changes.
    // =================================================

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

  // ===================================================
  // SCHEMA OPTIONS
  // ===================================================

  {
    timestamps: true,
  },
);

// =====================================================
// EXPORT COMPLAINT MODEL
// =====================================================

module.exports = mongoose.model("Complaint", complaintSchema);
