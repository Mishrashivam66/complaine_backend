const mongoose = require("mongoose");

const inventorySchema = new mongoose.Schema(
  {
    // ==========================================
    // ITEM INFORMATION
    // ==========================================

    itemCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: undefined,
    },

    itemName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    itemDescription: {
      type: String,
      trim: true,
      default: "",
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    otherCategory: {
      type: String,
      trim: true,
      default: "",
    },

    unit: {
      type: String,
      trim: true,
      default: "Piece",
    },

    // ==========================================
    // STOCK ACCOUNTING
    // ==========================================

    openingQuantity: {
      type: Number,
      default: null,
      min: 0,
    },

    incomingQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    outgoingQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    currentStock: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    minimumStock: {
      type: Number,
      required: true,
      default: 5,
      min: 0,
    },

    status: {
      type: String,
      default: "Available",
    },

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
// STOCK STATUS UPDATE
// ==========================================

inventorySchema.pre("validate", function () {
  if (typeof this.itemCode === "string") {
    const code = this.itemCode.trim().toUpperCase();
    this.itemCode = code || undefined;
  }

  const stock = Number(this.currentStock || 0);
  const minimum = Number(this.minimumStock || 0);

  if (stock <= 0) {
    this.status = "Out Of Stock";
  } else if (stock <= minimum) {
    this.status = "Low Stock";
  } else {
    this.status = "Available";
  }
});

// ==========================================
// UNIQUE ITEM CODE
// ==========================================

inventorySchema.index(
  { itemCode: 1 },
  {
    unique: true,
    partialFilterExpression: {
      itemCode: { $type: "string", $gt: "" },
    },
  },
);

// ==========================================
// EXPORT
// ==========================================

module.exports = mongoose.model("Inventory", inventorySchema);
