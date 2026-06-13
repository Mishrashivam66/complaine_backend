const mongoose = require("mongoose");

// ==========================================
// LOCATION SCHEMA
// ==========================================

const locationSchema = new mongoose.Schema(
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
    // LOCATION TYPE
    // ==========================================

    locationType: {
      type: String,

      enum: [
        "HOSTEL",

        "SPORTS_COMPLEX",

        "ACADEMIC_BLOCK",

        "LIBRARY",

        "LAB",

        "CAFETERIA",

        "AUDITORIUM",
      ],

      default: "HOSTEL",
    },

    // ==========================================
    // BLOCK
    // ==========================================

    block: {
      type: String,

      default: "",
    },

    // ==========================================
    // FLOOR
    // ==========================================

    floor: {
      type: String,

      default: "",
    },

    // ==========================================
    // ROOM NUMBER
    // ==========================================

    roomNumber: { type: String, default: "" },

    // ==========================================
    // TOTAL BLOCKS
    // ==========================================

    blocks: {
      type: Number,

      default: "",
    },

    // ==========================================
    // TOTAL FLOORS
    // ==========================================

    floors: {
      type: Number,

      default: " ",
    },

    // ==========================================
    // ROOM STATUS
    // ==========================================

    isOccupied: {
      type: Boolean,

      default: false,
    },

    // ==========================================
    // CAPACITY
    // ==========================================

    capacity: {
      type: Number,

      default: 3,
    },

    // ==========================================
    // CURRENT STUDENTS
    // ==========================================

    currentStudents: {
      type: Number,

      default: 0,
    },
  },

  {
    timestamps: true,
  },
);

// ==========================================
// EXPORT
// ==========================================

module.exports = mongoose.model(
  "Location",

  locationSchema,
);
