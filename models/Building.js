const mongoose = require("mongoose");

// ==========================================
// BUILDING SCHEMA
// ==========================================

const buildingSchema = new mongoose.Schema(
  {
    // ==========================================
    // BUILDING NAME
    // ==========================================

    buildingName: {
      type: String,

      required: true,

      trim: true,
    },

    // ==========================================
    // BUILDING TYPE
    // ==========================================

    buildingType: {
      type: String,

      enum: [
        "ENGINEERING",

        "ADMINISTRATION",

        "MANAGEMENT",

        "LAW",

        "LIBRARY",

        "SPORTS",

        "MEDICAL",

        "CAFETERIA",

        "AUDITORIUM",
      ],

      required: true,
    },

    // ==========================================
    // START FLOOR
    // ==========================================

    startFloor: {
      type: String,

      enum: ["Ground", "First", "Second", "Third", "Fourth", "Fifth"],

      default: "Ground",
    },

    // ==========================================
    // END FLOOR
    // ==========================================

    endFloor: {
      type: String,

      enum: ["Ground", "First", "Second", "Third", "Fourth", "Fifth"],

      default: "First",
    },

    // ==========================================
    // ROOM RANGE
    // ==========================================

    roomRange: {
      type: String,

      default: "",
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

module.exports = mongoose.model("Building", buildingSchema);
