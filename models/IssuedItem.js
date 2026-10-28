const mongoose = require("mongoose");

const issuedItemSchema = new mongoose.Schema(
  {
    // ==========================================
    // LEGACY REQUEST
    // ==========================================

    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Request",
      default: null,
    },

    // ==========================================
    // MATERIAL REQUEST
    // ==========================================

    materialRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MaterialRequest",
      default: null,
      index: true,
    },

    materialItemId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    complaint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Complaint",
      default: null,
      index: true,
    },

    jobCard: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobCard",
      default: null,
    },

    // ==========================================
    // INVENTORY DETAILS
    // ==========================================

    inventoryItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inventory",
      default: null,
    },

    itemCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    item: {
      type: String,
      required: true,
      trim: true,
    },

    unit: {
      type: String,
      trim: true,
      default: "Piece",
    },

    quantity: {
      type: Number,
      required: true,
      min: 0.001,
    },

    // ==========================================
    // LOCATION
    // ==========================================

    hostel: {
      type: String,
      trim: true,
      default: "",
    },

    block: {
      type: String,
      trim: true,
      default: "",
    },

    // ==========================================
    // TECHNICIAN DETAILS
    // ==========================================

    issuedTo: {
      type: String,
      required: true,
      trim: true,
    },

    // Technician assigned to complaint
    assignedTechnician: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Actual physical receiver
    receivedByTechnician: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    technicianId: {
      type: String,
      trim: true,
      default: "",
    },

    receiverTechnicianId: {
      type: String,
      trim: true,
      default: "",
    },

    // ==========================================
    // ISSUE DETAILS
    // ==========================================

    voucherNo: {
      type: String,
      trim: true,
      default: "",
    },

    storeSlipNo: {
      type: String,
      trim: true,
      default: "",
    },

    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    issuedDate: {
      type: Date,
      default: Date.now,
    },

    deliveredAt: {
      type: Date,
      default: null,
    },

    remarks: {
      type: String,
      trim: true,
      default: "",
    },

    status: {
      type: String,
      enum: ["Issued", "Delivered", "Out Of Stock", "Low Stock"],
      default: "Issued",
    },

    // ==========================================
    // TECHNICIAN RECEIVING STATUS
    // ==========================================

    receivingStatus: {
      type: String,
      enum: ["AWAITING_CONFIRMATION", "CONFIRMED", "DISPUTED", "RESOLVED"],
      default: "AWAITING_CONFIRMATION",
      index: true,
    },

    receivedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    shortageQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    receivingConfirmedAt: {
      type: Date,
      default: null,
    },

    receivingRemarks: {
      type: String,
      trim: true,
      default: "",
    },

    // ==========================================
    // RETRIEVAL TRACKING
    // ==========================================

    retrievalRequired: {
      type: Boolean,
      default: false,
    },

    expectedRetrievalQty: {
      type: Number,
      default: 0,
      min: 0,
    },

    retrievedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    retrievalStatus: {
      type: String,
      enum: [
        "NOT_REQUIRED",
        "PENDING_RETRIEVAL",
        "PARTIALLY_RETRIEVED",
        "RETRIEVED",
      ],
      default: "NOT_REQUIRED",
    },

    lastRetrievedAt: {
      type: Date,
      default: null,
    },

    // ==========================================
    // RECORD STATUS
    // ==========================================

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// ==========================================
// VALIDATION
// ==========================================

issuedItemSchema.pre("validate", function () {
  const issued = Number(this.quantity);
  const received = Number(this.receivedQuantity || 0);
  const shortage = Number(this.shortageQuantity || 0);

  if (!Number.isFinite(received) || received < 0 || received > issued) {
    this.invalidate(
      "receivedQuantity",
      "Received quantity must be between 0 and issued quantity.",
    );
  }

  if (!Number.isFinite(shortage) || shortage < 0 || shortage > issued) {
    this.invalidate("shortageQuantity", "Invalid shortage quantity.");
  }

  // Preserve retrieval validation.

  if (!this.retrievalRequired) {
    this.expectedRetrievalQty = 0;
    this.retrievedQuantity = 0;
    this.retrievalStatus = "NOT_REQUIRED";
    return;
  }

  const expected = Number(this.expectedRetrievalQty);
  const retrieved = Number(this.retrievedQuantity);

  if (!Number.isFinite(expected) || expected <= 0) {
    this.invalidate(
      "expectedRetrievalQty",
      "Expected retrieval quantity must be greater than zero.",
    );
    return;
  }

  if (!Number.isFinite(retrieved) || retrieved < 0 || retrieved > expected) {
    this.invalidate(
      "retrievedQuantity",
      "Retrieved quantity must be between zero and expected quantity.",
    );
    return;
  }

  if (retrieved === 0) {
    this.retrievalStatus = "PENDING_RETRIEVAL";
  } else if (retrieved < expected) {
    this.retrievalStatus = "PARTIALLY_RETRIEVED";
  } else {
    this.retrievalStatus = "RETRIEVED";
  }
});

// ==========================================
// INDEXES
// ==========================================

issuedItemSchema.index({ issuedDate: -1 });

issuedItemSchema.index({
  assignedTechnician: 1,
  retrievalStatus: 1,
});

issuedItemSchema.index({
  receivedByTechnician: 1,
  receivingStatus: 1,
});

issuedItemSchema.index({
  materialRequest: 1,
  materialItemId: 1,
});

// ==========================================
// EXPORT
// ==========================================

module.exports = mongoose.model("IssuedItem", issuedItemSchema);
