"use strict";

const mongoose = require("mongoose");

const auditEntrySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ["BLOCK", "UNBLOCK"],
      required: true,
    },

    reason: {
      type: String,
      required: true,
      maxlength: 500,
    },

    category: {
      type: String,
      enum: ["ABUSIVE_LANGUAGE", "FALSE_COMPLAINT", "MISUSE", "OTHER"],
      default: "OTHER",
    },

    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const schema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      unique: true,
      required: true,
      index: true,
    },

    isBlocked: {
      type: Boolean,
      default: false,
      index: true,
    },

    blockReason: {
      type: String,
      default: "",
    },

    blockCategory: {
      type: String,
      enum: ["ABUSIVE_LANGUAGE", "FALSE_COMPLAINT", "MISUSE", "OTHER"],
      default: "OTHER",
    },

    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    blockedAt: {
      type: Date,
      default: null,
    },

    history: {
      type: [auditEntrySchema],
      default: [],
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
  },
);

module.exports = mongoose.model("StudentComplaintRestriction", schema);
