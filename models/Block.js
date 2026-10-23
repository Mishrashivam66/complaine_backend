"use strict";

const mongoose = require("mongoose");

const FLOORS = [
  "Ground",
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
  "Eighth",
];

const blockSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      match: /^[A-Z0-9][A-Z0-9_-]{0,11}$/,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    buildingType: {
      type: String,
      trim: true,
      default: "",
      maxlength: 100,
    },

    startFloor: {
      type: String,
      enum: FLOORS,
      default: "Ground",
    },

    endFloor: {
      type: String,
      enum: FLOORS,
      default: "Fourth",
    },

    roomRange: {
      type: String,
      trim: true,
      default: "",
      maxlength: 100,
    },

    departments: [
      {
        type: String,
        trim: true,
        maxlength: 120,
      },
    ],

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Block", blockSchema);
