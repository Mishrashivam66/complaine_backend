const mongoose = require("mongoose");

const materialReceivingSchema = new mongoose.Schema(
  {
    issuedItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IssuedItem",
      required: true,
      unique: true,
    },

    technician: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    issuedQuantity: {
      type: Number,
      required: true,
      min: 0,
    },

    receivedQuantity: {
      type: Number,
      required: true,
      min: 0,
    },

    shortageQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    status: {
      type: String,
      enum: ["CONFIRMED", "DISPUTED", "RESOLVED"],
      required: true,
    },

    technicianRemarks: {
      type: String,
      default: "",
      trim: true,
    },

    confirmedAt: {
      type: Date,
      default: Date.now,
    },

    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    resolvedAt: {
      type: Date,
      default: null,
    },

    resolutionRemarks: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("MaterialReceiving", materialReceivingSchema);
