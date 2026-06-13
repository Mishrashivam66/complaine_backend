const mongoose = require("mongoose");

const escalationSchema = new mongoose.Schema(
  {
    complaintId: {
      type: String,
      default: "",
    },

    studentName: {
      type: String,
      default: "",
    },

    issue: {
      type: String,
      default: "",
    },

    priority: {
      type: String,

      enum: ["Low", "Medium", "High"],

      default: "Low",
    },

    status: {
      type: String,

      enum: ["Pending", "Resolved"],

      default: "Pending",
    },
  },

  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Escalation", escalationSchema);
