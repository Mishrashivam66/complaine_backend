const mongoose = require("mongoose");

const issuedItemSchema = new mongoose.Schema(
  {
    // ==========================================
    // LEGACY REQUEST REFERENCE
    // ==========================================

    // Old Store Manager records remain compatible.
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Request",
      default: null,
    },

    // ==========================================
    // NEW MATERIAL REQUEST REFERENCE
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
    // ITEM DETAILS
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
      min: 0.01,
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

    // Preserve existing string-based receiver.
    issuedTo: {
      type: String,
      required: true,
      trim: true,
    },

    // Technician assigned to the complaint.
    assignedTechnician: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Person who physically collected the item.
    receivedByTechnician: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
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
    // ISSUE VOUCHER DETAILS
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

    // ==========================================
    // MATERIAL ISSUE STATUS
    // ==========================================

    // Retain old statuses for existing data.
    status: {
      type: String,
      enum: ["Issued", "Delivered", "Out Of Stock", "Low Stock"],
      default: "Issued",
    },

    // ==========================================
    // RETRIEVAL TRACKING
    // ==========================================

    // Not every material requires retrieval.
    // Example:
    // Tube light replacement -> true
    // Consumable PVC tape -> false

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
      "Expected retrieval quantity must be greater than zero",
    );
    return;
  }

  if (!Number.isFinite(retrieved) || retrieved < 0 || retrieved > expected) {
    this.invalidate(
      "retrievedQuantity",
      "Retrieved quantity must be between zero and expected quantity",
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

issuedItemSchema.index({
  issuedDate: -1,
});

issuedItemSchema.index({
  assignedTechnician: 1,
  retrievalStatus: 1,
});

issuedItemSchema.index({
  materialRequest: 1,
  materialItemId: 1,
});

// ==========================================
// EXPORT
// ==========================================

module.exports = mongoose.model("IssuedItem", issuedItemSchema);
