const mongoose = require("mongoose");

const emergencyAlertSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",
    },

    hostel: {
      type: String,

      required: true,
    },

    room: {
      type: String,
    },

    type: {
      type: String,

      enum: ["Medical", "Fire", "Security", "Electricity", "Emergency"],

      required: true,
    },

    message: {
      type: String,

      required: true,
    },

    status: {
      type: String,

      enum: ["Active", "Resolved"],

      default: "Active",
    },
  },

  {
    timestamps: true,
  },
);

module.exports = mongoose.model("EmergencyAlert", emergencyAlertSchema);
