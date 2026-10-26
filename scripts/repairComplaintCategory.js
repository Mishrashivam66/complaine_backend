"use strict";

const mongoose = require("mongoose");

require("dotenv").config();

const Category = require("../models/Category");
const Complaint = require("../models/Complaint");
const JobCard = require("../models/JobCard");

const complaintId = process.argv[2];
const targetName = process.argv[3];
const apply = process.argv.includes("--apply");

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function run() {
  if (!complaintId || !targetName) {
    throw new Error(
      "Usage: node scripts/repairComplaintCategory.js CMP-374089 CARPENTRY [--apply]",
    );
  }

  const uri =
    process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;

  if (!uri) {
    throw new Error("MongoDB connection environment variable missing");
  }

  await mongoose.connect(uri);

  const master = await Category.findOne({
    categoryName: new RegExp(`^${escapeRegex(targetName)}$`, "i"),
    department: "MAINTENANCE",
    isActive: { $ne: false },
    isDeleted: { $ne: true },
  });

  if (!master) {
    throw new Error("Target category not found in active Admin Master");
  }

  const complaint = await Complaint.findOne({
    complaintId,
  });

  if (!complaint) {
    throw new Error("Complaint not found");
  }

  if (
    complaint.status !== "PENDING" ||
    complaint.assignedTo ||
    complaint.workerAssigned
  ) {
    throw new Error("Only PENDING and unassigned complaints can be corrected");
  }

  const hasJobCard = await JobCard.exists({
    "complaints.complaint": complaint._id,
  });

  if (hasJobCard) {
    throw new Error("Complaint has a JobCard. Manual review required.");
  }

  console.log({
    mode: apply ? "APPLY" : "DRY RUN",
    complaintId,
    currentCategory: complaint.category,
    targetCategory: master.categoryName,
  });

  if (!apply) {
    console.log("No changes made. Review the mapping first.");
    return;
  }

  const result = await Complaint.updateOne(
    {
      _id: complaint._id,
      category: complaint.category,
      status: "PENDING",
      assignedTo: null,
      workerAssigned: { $ne: true },
    },
    {
      $set: {
        category: master.categoryName,
      },
    },
  );

  if (result.modifiedCount !== 1) {
    throw new Error(
      "Complaint was changed or already updated. No correction applied.",
    );
  }

  console.log("Category corrected. Complaint history preserved.");
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
