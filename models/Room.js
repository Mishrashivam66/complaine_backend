const mongoose = require("mongoose");

// ==========================================
// ROOM SCHEMA
// ==========================================

const roomSchema = new mongoose.Schema(
  {
    // ==========================================
    // HOSTEL
    // ==========================================

    hostel: {
      type: String,

      required: true,
    },

    // ==========================================
    // FLOOR
    // ==========================================

    floor: {
      type: String,

      enum: ["GROUND", "FIRST", "SECOND", "THIRD"],

      required: true,
    },

    // ==========================================
    // POCKET
    // ==========================================

    pocket: {
      type: String,

      required: true,
    },

    // ==========================================
    // ROOM NUMBER
    // EXAMPLE:
    // G1A
    // F2B
    // S5C
    // ==========================================

    roomNumber: {
      type: String,

      required: true,

      unique: true,
    },

    // ==========================================
    // ROOM CAPACITY
    // ==========================================

    capacity: {
      type: Number,

      default: 2,
    },

    // ==========================================
    // OCCUPIED COUNT
    // ==========================================

    occupied: {
      type: Number,

      default: 0,
    },

    // ==========================================
    // STUDENTS
    // ==========================================

    students: [
      {
        type: mongoose.Schema.Types.ObjectId,

        ref: "User",
      },
    ],
  },

  {
    timestamps: true,
  },
);

// ==========================================
// EXPORT
// ==========================================

module.exports = mongoose.model("Room", roomSchema);
