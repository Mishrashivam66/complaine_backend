"use strict";

const mongoose = require("mongoose");

const hostelSchema = new mongoose.Schema(
  {
    hostelName: {
      type: String,
      required: [true, "Hostel name is required"],
      trim: true,
      maxlength: 120,
    },

    // Optional for older records.
    // Required for NEW hostels by controller.
    hostelCode: {
      type: String,
      trim: true,
      uppercase: true,
      match: /^[A-Z0-9][A-Z0-9_-]{0,11}$/,
      unique: true,
      sparse: true,
    },

    hostelType: {
      type: String,
      enum: ["BOYS", "GIRLS", "CO-ED", "STAFF"],
      default: "BOYS",
    },

    totalFloors: {
      type: Number,
      default: 4,
      min: 0,
      max: 100,
    },

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

    // LEGACY FIELDS
    // Kept only for old data compatibility.
    // No new Room Allocation functionality.

    totalRooms: {
      type: Number,
      default: 0,
    },

    totalCapacity: {
      type: Number,
      default: 0,
    },

    occupiedBeds: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Hostel", hostelSchema);
