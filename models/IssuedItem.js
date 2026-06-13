const mongoose = require("mongoose");

const issuedItemSchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "Request",
    },

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

    issuedTo: {
      type: String,

      required: true,
    },

    issuedDate: {
      type: Date,

      default: Date.now,
    },

    status: {
      type: String,

      enum: ["Issued", "Delivered", "Out Of Stock", "Low Stock"],

      default: "Issued",
    },
  },

  {
    timestamps: true,
  },
);

module.exports = mongoose.model("IssuedItem", issuedItemSchema);
