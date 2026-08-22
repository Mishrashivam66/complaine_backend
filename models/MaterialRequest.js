const mongoose = require("mongoose");

// ==========================================
// MATERIAL ITEM SCHEMA
// ==========================================

const materialItemSchema = new mongoose.Schema(
  {
    itemName: {
      type: String,
      required: true,
      trim: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0.01,
    },

    unit: {
      type: String,
      enum: [
        "PIECE",
        "METER",
        "KG",
        "GRAM",
        "LITER",
        "ML",
        "BOX",
        "PACKET",
        "ROLL",
        "SET",
        "PAIR",
        "OTHER",
      ],
      default: "PIECE",
    },

    // ======================================
    // STORE APPROVAL
    // ======================================

    approvedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    issuedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: [
        "PENDING",
        "APPROVED",
        "REJECTED",
        "OUT_OF_STOCK",
        "PARTIALLY_ISSUED",
        "ISSUED",
      ],
      default: "PENDING",
    },

    storeRemarks: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

// ==========================================
// MATERIAL REQUEST SCHEMA
// ==========================================

const materialRequestSchema = new mongoose.Schema(
  {
    // ======================================
    // REQUEST ID
    // ======================================

    requestId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },

    // ======================================
    // COMPLAINT
    // ======================================

    complaint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Complaint",
      required: true,
    },

    // ======================================
    // JOB CARD
    // OPTIONAL - WILL BE LINKED LATER
    // ======================================

    jobCard: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobCard",
      default: null,
    },

    // ======================================
    // WORKER
    // ======================================

    assignedWorker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ======================================
    // REQUESTED BY
    // ======================================

    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ======================================
    // MULTIPLE MATERIALS
    // ======================================

    materials: {
      type: [materialItemSchema],

      validate: {
        validator: function (value) {
          return value && value.length > 0;
        },

        message: "At least one material is required",
      },
    },

    // ======================================
    // REASON
    // ======================================

    reason: {
      type: String,
      required: true,
      trim: true,
    },

    // ======================================
    // OVERALL STATUS
    // ======================================

    status: {
      type: String,

      enum: [
        "PENDING",
        "APPROVED_BY_STORE",
        "PARTIALLY_APPROVED",
        "PARTIALLY_ISSUED",
        "REJECTED",
        "OUT_OF_STOCK",
        "ISSUED",
      ],

      default: "PENDING",
    },

    // ======================================
    // STORE DETAILS
    // ======================================

    approvedByStore: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    issuedAt: {
      type: Date,
      default: null,
    },

    storeSlipNo: {
      type: String,
      default: "",
      trim: true,
    },

    storeRemarks: {
      type: String,
      default: "",
    },
  },
  {
    // Automatically creates createdAt + updatedAt
    timestamps: true,
  },
);

// ==========================================
// AUTO DELETE AFTER 7 DAYS
// ==========================================
//
// createdAt is automatically generated because
// timestamps: true is enabled above.
//
// 7 days = 7 * 24 * 60 * 60
//        = 604800 seconds
//
// MongoDB TTL will automatically delete the
// complete MaterialRequest document after 7 days.
// ==========================================

materialRequestSchema.index(
  {
    createdAt: 1,
  },
  {
    expireAfterSeconds: 604800,
  },
);

// ==========================================
// EXPORT
// ==========================================

module.exports = mongoose.model("MaterialRequest", materialRequestSchema);
