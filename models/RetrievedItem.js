const mongoose = require("mongoose");

const retrievedItemSchema = new mongoose.Schema(
  {
    issuedItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IssuedItem",
      required: true,
      index: true,
    },

    materialRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MaterialRequest",
      default: null,
    },

    complaint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Complaint",
      default: null,
    },

    jobCard: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobCard",
      default: null,
    },

    itemCode: {
      type: String,
      default: "",
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

    quantity: {
      type: Number,
      required: true,
      min: 0.001,
    },

    condition: {
      type: String,
      enum: ["DAMAGED", "BROKEN", "FAULTY", "USED", "REPAIRABLE", "SCRAP"],
      default: "DAMAGED",
    },

    receivedFrom: {
      type: String,
      required: true,
      trim: true,
    },

    technicianId: {
      type: String,
      default: "",
    },

    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    receivedAt: {
      type: Date,
      default: Date.now,
    },

    remarks: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

retrievedItemSchema.index({
  receivedAt: -1,
});

module.exports = mongoose.model("RetrievedItem", retrievedItemSchema);
