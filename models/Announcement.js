const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },

    message: {
      type: String,
      required: true,
    },

    type: {
      type: String,

      enum: ["INFO", "WARNING", "EMERGENCY"],

      default: "INFO",
    },

    hostel: {
      type: String,

      default: "All Hostels",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",
    },
  },

  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Announcement", announcementSchema);
