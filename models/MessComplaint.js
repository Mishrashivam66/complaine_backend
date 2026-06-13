const mongoose = require("mongoose");

const messComplaintSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      required: true,
    },

    hostel: {
      type: String,

      default: "",
    },

    title: {
      type: String,

      required: true,
    },

    description: {
      type: String,

      required: true,
    },

    category: {
      type: String,

      enum: ["FOOD", "HYGIENE", "CLEANING", "STAFF", "MENU"],

      default: "FOOD",
    },

    rating: {
      type: Number,

      min: 1,

      max: 5,

      default: 3,
    },

    status: {
      type: String,

      enum: ["PENDING", "IN_PROGRESS", "RESOLVED"],

      default: "PENDING",
    },
  },

  {
    timestamps: true,
  },
);

module.exports = mongoose.model("MessComplaint", messComplaintSchema);
