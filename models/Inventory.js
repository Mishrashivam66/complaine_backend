const mongoose = require("mongoose");

const inventorySchema = new mongoose.Schema(
  {
    itemName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    category: {
      type: String,
      required: true,
    },

    otherCategory: {
      type: String,
      default: "",
    },

    currentStock: {
      type: Number,
      required: true,
      default: 0,
    },

    minimumStock: {
      type: Number,
      required: true,
      default: 5,
    },

    unit: {
      type: String,
      default: "Piece",
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
// AUTO STATUS UPDATE
// ==========================================

inventorySchema.pre("save", function () {
  if (this.currentStock === 0) {
    this.status = "Out Of Stock";
  } else if (this.currentStock <= this.minimumStock) {
    this.status = "Low Stock";
  } else {
    this.status = "Available";
  }
});

// ==========================================

module.exports = mongoose.model("Inventory", inventorySchema);
