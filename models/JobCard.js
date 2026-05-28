const mongoose = require("mongoose");

const jobCardSchema = new mongoose.Schema(
  {
    jobCardId: {
      type: String,
      unique: true,
      required: true,
    },

    complaint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Complaint",
      required: true,
    },

    assignedWorker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    status: {
      type: String,
      enum: [
        "ASSIGNED",
        "IN_PROGRESS",
        "MATERIAL_REQUIRED",
        "COMPLETED",
      ],
      default: "ASSIGNED",
    },

    workerStatus: {
      type: String,
      enum: [
        "NOT_STARTED",
        "WORKING",
        "WAITING_MATERIAL",
        "COMPLETED",
      ],
      default: "NOT_STARTED",
    },

    materialRequired: {
      type: Boolean,
      default: false,
    },

    remarks: {
      type: String,
      default: "",
    },

    completionTime: {
      type: Date,
      default: null,
    },

    assignedDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("JobCard", jobCardSchema);