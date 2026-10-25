"use strict";

const mongoose = require("mongoose");

const complaintActionLogSchema = new mongoose.Schema(
  {
    complaint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Complaint",
      required: true,
      index: true,
    },

    action: {
      type: String,
      enum: ["VERIFIED", "RETURNED_FOR_CORRECTION"],
      required: true,
    },

    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    technician: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    fromStatus: {
      type: String,
      required: true,
    },

    toStatus: {
      type: String,
      required: true,
    },

    remarks: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("ComplaintActionLog", complaintActionLogSchema);
