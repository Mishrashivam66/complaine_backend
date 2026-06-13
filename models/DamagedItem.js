const mongoose = require("mongoose");

const damagedItemSchema = new mongoose.Schema(
  {
    item: {
      type: String,

      required: true,
    },

    hostel: {
      type: String,

      required: true,
    },

    quantity: {
      type: Number,

      required: true,
    },

    issue: {
      type: String,

      required: true,
    },

    condition: {
      type: String,

      enum: ["Damaged", "Broken", "Torn", "Under Repair", "Scrapped"],

      default: "Damaged",
    },

    reportedDate: {
      type: Date,

      default: Date.now,
    },
  },

  {
    timestamps: true,
  },
);

module.exports = mongoose.model("DamagedItem", damagedItemSchema);
