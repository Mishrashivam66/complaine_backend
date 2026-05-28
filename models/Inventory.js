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

    price: {
      type: Number,
      required: true,
      default: 0,
    },

    location: {
      type: String,
      default: "Main Store",
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "Inventory",
  inventorySchema
);