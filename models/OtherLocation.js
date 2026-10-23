"use strict";

const mongoose = require("mongoose");

// ==========================================
// OTHER LOCATION MASTER - AMIMAINTAIN
// ==========================================

const otherLocationSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      match: /^[A-Z0-9][A-Z0-9_-]{0,11}$/,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    category: {
      type: String,
      trim: true,
      default: "GENERAL",
      maxlength: 80,
    },

    areas: [
      {
        type: String,
        trim: true,
        maxlength: 120,
      },
    ],

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    archivedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("OtherLocation", otherLocationSchema);
