const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    title: {
      type: String,

      required: true,
    },

    category: {
      type: String,

      enum: ["Complaints", "Discipline", "Attendance", "Emergency"],

      required: true,
    },

    generatedBy: {
      type: String,

      required: true,
    },

    hostel: {
      type: String,

      required: true,
    },

    status: {
      type: String,

      enum: ["GENERATED", "PENDING"],

      default: "GENERATED",
    },
  },

  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Report", reportSchema);
