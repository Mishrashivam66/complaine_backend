const mongoose = require("mongoose");
const complaintItemSchema = new mongoose.Schema(
  {
    complaint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Complaint",
      required: true,
    },
    serialNumber: {
      type: Number,
      default: 1,
    },

    roomNumber: {
      type: String,
      default: "",
    },

    floor: {
      type: String,
      default: "",
    },

    title: {
      type: String,
      default: "",
    },

    titleHindi: {
      type: String,
      default: "",
    },

    description: {
      type: String,
      default: "",
    },

    descriptionHindi: {
      type: String,
      default: "",
    },

    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      default: "MEDIUM",
    },

    status: {
      type: String,
      enum: ["ASSIGNED", "IN_PROGRESS", "WAITING_MATERIAL", "COMPLETED"],
      default: "ASSIGNED",
    },

    startedAt: {
      type: Date,
      default: null,
    },

    // ✅ NEW
    completedAt: {
      type: Date,
      default: null,
    },

    // ==========================================
    // MATERIAL WORKFLOW
    // ==========================================

    materialRequired: {
      type: Boolean,
      default: false,
    },

    materialRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MaterialRequest",
      default: null,
    },

    storeSlipNo: {
      type: String,
      default: "",
    },

    storeApprovedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    storeUpdatedAt: {
      type: Date,
      default: null,
    },

    // ==========================================
    // STUDENT / ATTENDANT VERIFICATION
    // ==========================================

    verifiedBy: {
      type: String,
      enum: ["STUDENT", "ATTENDANT", ""],
      default: "",
    },

    verifierName: {
      type: String,
      default: "",
    },

    studentVerified: {
      type: Boolean,
      default: false,
    },

    studentSignature: {
      type: String,
      default: "",
    },

    verifiedAt: {
      type: Date,
      default: null,
    },
    workerRemarks: {
      type: String,
      default: "",
    },

    managerRemarks: {
      type: String,
      default: "",
    },

    remarks: {
      type: String,
      default: "",
    },
  },
  {
    _id: false,
  },
);
// ==========================================
// JOB CARD SCHEMA
// ==========================================

const jobCardSchema = new mongoose.Schema(
  {
    // ==========================================
    // JOB CARD ID
    // ==========================================

    jobCardId: {
      type: String,
      required: true,
      unique: true,
    },

    // ==========================================
    // LOCATION DETAILS
    // ==========================================
    hostel: {
      type: String,
      default: "",
    },

    block: {
      type: String,
      default: "",
    },
    category: {
      type: String,
      required: true,
    },

    // ==========================================
    // WORKER
    // ==========================================

    assignedWorker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    assignedDate: {
      type: Date,
      default: Date.now,
    },

    // ==========================================
    // GROUPED COMPLAINTS
    // ==========================================

    complaints: {
      type: [complaintItemSchema],
      validate: {
        validator: function (value) {
          return value.length > 0 && value.length <= 10;
        },
        message: "One Job Card can contain maximum 10 complaints.",
        required: true,
      },
    },

    totalComplaints: {
      type: Number,
      default: 0,
    },

    completedComplaints: {
      type: Number,
      default: 0,
    },
    // ==========================================
    // JOB STATUS
    // ==========================================

    status: {
      type: String,
      enum: [
        "CREATED",
        "ASSIGNED",
        "IN_PROGRESS",
        "PARTIALLY_COMPLETED",
        "WAITING_MATERIAL",
        "READY_FOR_VERIFICATION",
        "COMPLETED",
        "CLOSED",
      ],
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
    // JOB TYPE
    // ==========================================

    jobType: {
      type: String,
      enum: ["CORRECTIVE", "PREVENTIVE", "BREAKDOWN", "EMERGENCY"],
      default: "CORRECTIVE",
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
    // WORK TIMING
    // ==========================================

    startedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    closedAt: {
      type: Date,
      default: null,
    },

    // ==========================================
    // QR CODE
    // ==========================================

    qrCode: {
      type: String,
      default: "",
    },

    // ==========================================
    // MAINTENANCE REMARKS
    // ==========================================

    managerRemarks: {
      type: String,
      default: "",
    },

    workerRemarks: {
      type: String,
      default: "",
    },

    // ==========================================
    // SIGNATURES
    // ==========================================

    workerSigned: {
      type: Boolean,
      default: false,
    },

    workerSignature: {
      type: String,
      default: "",
    },

    workerSignedAt: {
      type: Date,
      default: null,
    },

    wardenVerified: {
      type: Boolean,
      default: false,
    },

    wardenSignature: {
      type: String,
      default: "",
    },

    wardenSignedAt: {
      type: Date,
      default: null,
    },

    managerVerified: {
      type: Boolean,
      default: false,
    },

    managerSignature: {
      type: String,
      default: "",
    },

    managerSignedAt: {
      type: Date,
      default: null,
    },

    // ==========================================
    // IMAGES
    // ==========================================

    beforeWorkImages: [
      {
        type: String,
      },
    ],

    afterWorkImages: [
      {
        type: String,
      },
    ],

    // ==========================================
    // PRINT WORKFLOW
    // ==========================================

    printStatus: {
      type: String,
      enum: ["PENDING", "PRINTED"],
      default: "PENDING",
    },

    printedAt: {
      type: Date,
      default: null,
    },

    printedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ==========================================
    // ACTIVE / HISTORY
    // ==========================================

    isCompleted: {
      type: Boolean,
      default: false,
    },

    movedToHistory: {
      type: Boolean,
      default: false,
    },
    // ==========================================
    // ACTIVE / HISTORY
    // ==========================================

    isCompleted: {
      type: Boolean,
      default: false,
    },

    movedToHistory: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ==========================================
// INDEXES
// ==========================================
jobCardSchema.index({
  hostel: 1,
  category: 1,
  assignedWorker: 1,
  isCompleted: 1,
});

jobCardSchema.index({
  assignedWorker: 1,
});

// ==========================================
// VIRTUALS
// ==========================================
jobCardSchema.pre("save", function () {
  this.totalComplaints = this.complaints.length;

  this.completedComplaints = this.complaints.filter(
    (item) => item.status === "COMPLETED",
  ).length;

  const waitingMaterial = this.complaints.some(
    (item) => item.status === "WAITING_MATERIAL",
  );

  if (waitingMaterial) {
    this.status = "WAITING_MATERIAL";
  } else if (
    this.completedComplaints > 0 &&
    this.completedComplaints < this.totalComplaints
  ) {
    this.status = "PARTIALLY_COMPLETED";
  } else if (
    this.completedComplaints === this.totalComplaints &&
    this.totalComplaints > 0
  ) {
    this.status = "READY_FOR_VERIFICATION";
    this.completedAt = new Date();
  }
});

jobCardSchema.virtual("pendingComplaints").get(function () {
  return this.totalComplaints - this.completedComplaints;
});

jobCardSchema.virtual("completionPercentage").get(function () {
  if (this.totalComplaints === 0) return 0;

  return Math.round((this.completedComplaints / this.totalComplaints) * 100);
});

// ==========================================
// FLOORS COVERED
// ==========================================

jobCardSchema.virtual("floorsCovered").get(function () {
  const floors = [
    ...new Set(
      this.complaints
        .map((item) => item.floor)
        .filter((floor) => floor && floor.trim() !== ""),
    ),
  ];

  return floors;
});
jobCardSchema.pre("validate", function () {
  const hostel = this.hostel?.trim();
  const block = this.block?.trim();

  if (!hostel && !block) {
    this.invalidate("hostel", "Hostel or Block location is required");
  }
});
// ==========================================
// EXPORT
// ==========================================

module.exports = mongoose.model("JobCard", jobCardSchema);
