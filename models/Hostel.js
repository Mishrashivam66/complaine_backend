const mongoose = require("mongoose");

// ==========================================
// HOSTEL SCHEMA
// ==========================================

const hostelSchema = new mongoose.Schema(
  {
    // ==========================================
    // HOSTEL NAME
    // ==========================================

    hostelName: {
      type: String,

      required: true,

      trim: true,
    },

    // ==========================================
    // HOSTEL TYPE
    // ==========================================

    hostelType: {
      type: String,

      enum: ["BOYS", "GIRLS", "INTERNATIONAL"],

      default: "BOYS",
    },

    // ==========================================
    // TOTAL FLOORS
    // ==========================================

    totalFloors: {
      type: Number,

      default: 4,
    },

    // ==========================================
    // TOTAL ROOMS
    // ==========================================

    totalRooms: {
      type: Number,

      default: 0,
    },

    // ==========================================
    // TOTAL CAPACITY
    // ==========================================

    totalCapacity: {
      type: Number,

      default: 0,
    },

    // ==========================================
    // OCCUPIED BEDS
    // ==========================================

    occupiedBeds: {
      type: Number,

      default: 0,
    },

    // ==========================================
    // STATUS
    // ==========================================

    isActive: {
      type: Boolean,

      default: true,
    },
  },

  {
    timestamps: true,
  },
);

// ==========================================
// EXPORT
// ==========================================

module.exports = mongoose.model("Hostel", hostelSchema);
