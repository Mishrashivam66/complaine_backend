"use strict";

const mongoose = require("mongoose");

const issueVoucherCounterSchema = new mongoose.Schema(
  {
    year: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    sequence: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

module.exports =
  mongoose.models.IssueVoucherCounter ||
  mongoose.model("IssueVoucherCounter", issueVoucherCounterSchema);
