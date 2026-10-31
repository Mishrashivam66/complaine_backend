"use strict";

const mongoose = require("mongoose");

// =============================================
// AMI MAINTENANCE — COMPLAINT MODEL
// =============================================

const toMinutes = (value) => {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const preferredVisitTimeSchema = new mongoose.Schema(
  {
    startTime: {
      type: String,
      default: "",
      trim: true,
    },
    endTime: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false },
);

preferredVisitTimeSchema.pre("validate", function (next) {
  const { startTime, endTime } = this;

  // Legacy complaints may not contain preferred timing.
  if (!startTime && !endTime) return next();

  const start = toMinutes(startTime);
  const end = toMinutes(endTime);

  if (
    start === null ||
    end === null ||
    start < 600 ||
    start > 900 ||
    end > 1020 ||
    end - start < 120
  ) {
    return next(
      new Error(
        "Preferred visit time must be between 10:00 AM and 5:00 PM with a minimum 2-hour duration.",
      ),
    );
  }

  next();
});

const complaintSchema = new mongoose.Schema(
  {
    // COMPLAINT ID
    complaintId: {
      type: String,
      unique: true,
    },

    // BASIC DETAILS
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },

    // HINDI TRANSLATION
    titleHindi: {
      type: String,
      default: "",
    },
    descriptionHindi: {
      type: String,
      default: "",
    },

    // COMPLAINT AREA
    complaintArea: {
      type: String,
      enum: ["HOSTEL", "DEPARTMENT", "CAMPUS"],
      default: "HOSTEL",
    },

    deadline: {
      type: Date,
    },

    floor: {
      type: String,
      default: "",
    },

    workerAssigned: {
      type: Boolean,
      default: false,
    },

    // CATEGORY
    category: {
      type: String,
      required: true,
    },
    subCategory: {
      type: String,
      default: "",
    },

    // PRIORITY
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      default: "MEDIUM",
    },

    // COMPLAINT STATUS
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

    // ESCALATION
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

    // WORK TIMESTAMPS
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

    // MAINTENANCE MANAGER
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignedDepartment: {
      type: String,
      default: "",
    },

    // TECHNICIAN REMARKS
    workerRemarks: {
      type: String,
      default: "",
    },

    // MATERIAL MANAGEMENT
    materialRequired: {
      type: Boolean,
      default: false,
    },
    materialDecision: {
      type: String,
      enum: ["PENDING", "REQUIRED", "NOT_REQUIRED"],
      default: "PENDING",
    },

    // COMPLAINT CREATOR
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

    // ASSIGNED TECHNICIAN
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // LOCATION
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
    issueLocation: {
      type: String,
      default: "",
    },

    // LEGACY AVAILABILITY
    availableFrom: {
      type: String,
      default: "",
    },
    availableTo: {
      type: String,
      default: "",
    },

    // LEGACY THREE-SLOT SYSTEM
    // Retained for existing complaint compatibility.
    // New complaints will use preferredVisitTime.
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

    // =========================================
    // NEW — SINGLE PREFERRED VISIT WINDOW
    // Working hours: 10 AM to 5 PM
    // Minimum duration: 2 hours
    // Example: 11:00 to 13:00
    // =========================================
    preferredVisitTime: {
      type: preferredVisitTimeSchema,
      default: undefined,
    },

    // MANAGER CONFIRMED VISIT
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

    // IMAGE
    image: {
      type: String,
      default: "",
    },

    // GENERAL REMARKS
    remarks: {
      type: String,
      default: "",
    },

    // STUDENT SATISFACTION VERIFICATION
    studentVerification: {
      decision: {
        type: String,
        enum: ["SATISFIED", "NOT_SATISFIED"],
        default: undefined,
      },
      reason: {
        type: String,
        trim: true,
        default: "",
        maxlength: 800,
      },
      verifiedAt: {
        type: Date,
        default: null,
      },
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
    },

    // REOPEN MANAGEMENT
    reopenCount: {
      type: Number,
      default: 0,
    },
    reopenReason: {
      type: String,
      default: "",
    },

    // CLOSURE
    closedAt: {
      type: Date,
      default: null,
    },

    // STATUS HISTORY
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

module.exports = mongoose.model("Complaint", complaintSchema);
