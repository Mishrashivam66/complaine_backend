const mongoose = require("mongoose");

const noticeSchema = new mongoose.Schema(
  {
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

      default: "GENERAL",
    },

    audience: {
      type: String,

      default: "All Students",
    },

    priority: {
      type: String,

      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],

      default: "LOW",
    },

    status: {
      type: String,

      enum: ["ACTIVE", "SCHEDULED", "EXPIRED"],

      default: "ACTIVE",
    },

    hostel: {
      type: String,

      default: "",
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

module.exports = mongoose.model("Notice", noticeSchema);
