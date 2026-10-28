const mongoose = require("mongoose");

const stockTransactionSchema = new mongoose.Schema(
  {
    inventoryItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inventory",
      required: true,
      index: true,
    },

    itemCode: {
      type: String,
      required: true,
      trim: true,
    },

    itemName: {
      type: String,
      required: true,
      trim: true,
    },

    unit: {
      type: String,
      default: "Piece",
    },

    type: {
      type: String,
      enum: [
        "OPENING",
        "INWARD",
        "ISSUE",
        "RETURN",
        "ADJUSTMENT_IN",
        "ADJUSTMENT_OUT",
      ],
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0,
    },

    balanceBefore: {
      type: Number,
      required: true,
      min: 0,
    },

    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },

    inward: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockInward",
      default: null,
      index: true,
    },

    referenceNo: {
      type: String,
      default: "",
      trim: true,
    },

    billNo: {
      type: String,
      default: "",
      trim: true,
    },

    vendorName: {
      type: String,
      default: "",
      trim: true,
    },

    transactionDate: {
      type: Date,
      required: true,
      default: Date.now,
    },

    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    remarks: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true },
);

stockTransactionSchema.index({
  inventoryItem: 1,
  transactionDate: -1,
});

module.exports = mongoose.model("StockTransaction", stockTransactionSchema);
