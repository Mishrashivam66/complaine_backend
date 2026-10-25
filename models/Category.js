"use strict";

const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    categoryName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 120,
    },

    // Legacy values retained for old records.
    // New categories will be maintenance-only.
    department: {
      type: String,
      enum: ["MAINTENANCE", "HOSTEL", "SECURITY", "MESS", "IT", "ADMIN"],
      default: "MAINTENANCE",
    },

    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      default: "MEDIUM",
    },

    icon: {
      type: String,
      trim: true,
      default: "Wrench",
      maxlength: 60,
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    subCategories: [
      {
        type: String,
        trim: true,
        maxlength: 120,
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    // Kept for compatibility.
    // API calculates live counts from Complaint.
    totalComplaints: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Category", categorySchema);
