const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
    },

    password: {
      type: String,
      required: true,
    },

    amizoneId: {
      type: String,
    },

    hostel: {
      type: String,
    },

    block: {
      type: String,
    },

    room: {
      type: String,
    },

    year: {
      type: String,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "PENDING", "LEFT_HOSTEL"],
      default: "PENDING",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Student", studentSchema);
