"use strict";

const mongoose = require("mongoose");

const { Schema } = mongoose;

// ==========================================
// MATERIAL ITEM SCHEMA
// ==========================================

const materialItemSchema = new Schema(
  {
    itemName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
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
    // MAINTENANCE MANAGER APPROVAL
    // ======================================

    managerApprovedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ======================================
    // STORE MANAGER APPROVAL
    // Existing fields preserved
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
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

// ==========================================
// MATERIAL REQUEST SCHEMA
// ==========================================

const materialRequestSchema = new Schema(
  {
    // ======================================
    // REQUEST ID
    // ======================================

    requestId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    // ======================================
    // COMPLAINT
    // ======================================

    complaint: {
      type: Schema.Types.ObjectId,
      ref: "Complaint",
      required: true,
      index: true,
    },

    // ======================================
    // OPTIONAL JOB CARD
    // ======================================

    jobCard: {
      type: Schema.Types.ObjectId,
      ref: "JobCard",
      default: null,
    },

    // ======================================
    // ASSIGNED TECHNICIAN
    // Keep assignedWorker for compatibility
    // ======================================

    assignedWorker: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ======================================
    // REQUESTED BY
    // ======================================

    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ======================================
    // REQUEST SOURCE
    // ======================================

    requestSource: {
      type: String,
      enum: ["MAINTENANCE_MANAGER", "TECHNICIAN"],
      default: "MAINTENANCE_MANAGER",
      index: true,
    },

    // ======================================
    // MATERIALS
    // ======================================

    materials: {
      type: [materialItemSchema],
      validate: {
        validator: function (value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: "At least one material is required",
      },
    },

    // ======================================
    // REQUEST REASON
    // ======================================

    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 1000,
    },

    // ======================================
    // MAINTENANCE MANAGER DECISION
    // ======================================

    managerApprovalStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },

    managerApprovedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    managerApprovedAt: {
      type: Date,
      default: null,
    },

    managerRejectedAt: {
      type: Date,
      default: null,
    },

    managerRemarks: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    // ======================================
    // STORE REQUEST STATUS
    // Existing status retained
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
      index: true,
    },

    // ======================================
    // STORE MANAGER DETAILS
    // ======================================

    approvedByStore: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    issuedBy: {
      type: Schema.Types.ObjectId,
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
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

// ==========================================
// DATABASE INDEXES
// ==========================================

materialRequestSchema.index({
  complaint: 1,
  createdAt: -1,
});

materialRequestSchema.index({
  requestSource: 1,
  managerApprovalStatus: 1,
  createdAt: -1,
});

materialRequestSchema.index({
  status: 1,
  createdAt: -1,
});

// ==========================================
// VALIDATION
// ==========================================

materialRequestSchema.pre("validate", function (next) {
  if (this.requestSource === "TECHNICIAN" && this.isNew) {
    this.managerApprovalStatus = "PENDING";
    this.managerApprovedBy = null;
    this.managerApprovedAt = null;
    this.managerRejectedAt = null;
  }

  if (this.requestSource === "MAINTENANCE_MANAGER" && this.isNew) {
    this.managerApprovalStatus = "APPROVED";
  }

  next();
});

// ==========================================
// NO AUTOMATIC DELETION
// ==========================================

// Material request records must remain
// permanently available for audit,
// complaint history, Store Manager reports,
// vouchers and technician history.
//
// The old MongoDB TTL index must be removed
// separately after verifying the exact index.

// ==========================================
// EXPORT
// ==========================================

module.exports = mongoose.model("MaterialRequest", materialRequestSchema);
