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
      default: 5,
    },

    department: {
      type: String,
      required: true,
    },

    status: {
      type: String,

      enum: ["Available", "Low Stock", "Out Of Stock"],

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
// AUTO STATUS
// ==========================================

inventorySchema.pre(
  "save",

  function (next) {
    if (this.currentStock === 0) {
      this.status = "Out Of Stock";
    } else if (this.currentStock <= this.minimumStock) {
      this.status = "Low Stock";
    } else {
      this.status = "Available";
    }

    next();
  },
);

module.exports = mongoose.model(
  "Inventory",

  inventorySchema,
);
