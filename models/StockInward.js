const mongoose = require("mongoose");

const inwardItemSchema = new mongoose.Schema(
  {
    inventoryItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inventory",
      required: true,
    },

    itemCode: {
      type: String,
      required: true,
    },

    itemName: {
      type: String,
      required: true,
    },

    category: {
      type: String,
      required: true,
    },

    unit: {
      type: String,
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0.001,
    },

    isNewItem: {
      type: Boolean,
      default: false,
    },

    stockBefore: {
      type: Number,
      required: true,
    },

    stockAfter: {
      type: Number,
      required: true,
    },
  },
  { _id: false },
);

const stockInwardSchema = new mongoose.Schema(
  {
    inwardNo: {
      type: String,
      required: true,
      unique: true,
    },

    importKey: {
      type: String,
      required: true,
      unique: true,
    },

    source: {
      type: String,
      enum: ["MANUAL", "EXCEL"],
      required: true,
    },

    billNo: {
      type: String,
      required: true,
      trim: true,
    },

    grnNo: {
      type: String,
      required: true,
      trim: true,
    },

    vendorName: {
      type: String,
      required: true,
      trim: true,
    },

    receiptDate: {
      type: Date,
      required: true,
    },

    remarks: {
      type: String,
      default: "",
    },

    fileName: {
      type: String,
      default: "",
    },

    quantityColumn: {
      type: String,
      default: "Quantity",
    },

    items: {
      type: [inwardItemSchema],
      default: [],
    },

    totalItems: {
      type: Number,
      default: 0,
    },

    totalQuantity: {
      type: Number,
      default: 0,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("StockInward", stockInwardSchema);
