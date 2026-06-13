const mongoose = require("mongoose");

const studentHistorySchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      required: true,
    },

    hostel: {
      type: String,

      required: true,
    },

    roomNumber: {
      type: String,
    },

    action: {
      type: String,

      enum: [
        "ROOM_CHANGED",

        "COMPLAINT",

        "DISCIPLINE",

        "VISITOR",

        "MESS",

        "EMERGENCY",

        "PROFILE_UPDATED",
      ],

      required: true,
    },

    description: {
      type: String,

      required: true,
    },

    status: {
      type: String,

      enum: ["ACTIVE", "COMPLETED", "PENDING"],

      default: "ACTIVE",
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",
    },
  },

  {
    timestamps: true,
  },
);

module.exports = mongoose.model("StudentHistory", studentHistorySchema);
