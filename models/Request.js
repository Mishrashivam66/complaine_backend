const mongoose = require("mongoose");

const requestSchema = new mongoose.Schema(
  {
    hostel: {
      type: String,
      required: true,
    },

    item: {
      type: String,
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
    },

    requestedBy: {
      type: String,
      required: true,
    },

    status: {
      type: String,

      enum: ["Pending", "Approved", "Rejected"],

      default: "Pending",
    },
  },

  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Request", requestSchema);
