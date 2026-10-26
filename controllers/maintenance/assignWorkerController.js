"use strict";

const mongoose = require("mongoose");

const Complaint = require("../../models/Complaint");

const sendNotification = require("../../utils/sendNotification");

const workerController = require("./workerController");

// ==========================================
// SHARED TECHNICIAN ASSIGNMENT LOGIC
// ==========================================

// Old assignment routes remain functional.
// Both paths now use the same validation,
// role checking and shift availability.

exports.getComplaintsForAssignment =
  workerController.getComplaintsForAssignment;

exports.getWorkers = workerController.getWorkers;

exports.assignWorker = workerController.assignWorker;

// ==========================================
// MATERIAL DECISION
// LEGACY ROUTE COMPATIBILITY
// ==========================================

exports.updateMaterialDecision = async (req, res) => {
  try {
    const { complaintId } = req.params;

    const decision = String(req.body?.decision || "").toUpperCase();

    if (!mongoose.isValidObjectId(complaintId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complaint ID",
      });
    }

    if (!["REQUIRED", "NOT_REQUIRED"].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: "Invalid material decision",
      });
    }

    const complaint = await Complaint.findById(complaintId).populate(
      "assignedTo",
      "name phone department",
    );

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    if (
      ["RESOLVED", "CLOSED"].includes(String(complaint.status).toUpperCase())
    ) {
      return res.status(409).json({
        success: false,
        message: "Closed complaint cannot be changed",
      });
    }

    // The new flow allows material decisions
    // before Technician assignment.

    complaint.materialDecision = decision;

    complaint.materialRequired = decision === "REQUIRED";

    await complaint.save();

    // Notify assigned Technician if present.

    if (complaint.assignedTo?._id) {
      try {
        await sendNotification({
          receiver: complaint.assignedTo._id,
          sender: req.user._id,

          title:
            decision === "REQUIRED"
              ? "Material Required"
              : "No Material Required",

          message: `Material decision updated for complaint ${complaint.complaintId}.`,

          type: decision === "REQUIRED" ? "MATERIAL" : "STATUS_UPDATE",

          relatedComplaint: complaint._id,
          actionUrl: "/technician/dashboard",
        });
      } catch (error) {
        console.error("MATERIAL NOTIFICATION ERROR:", error.message);
      }
    }

    return res.json({
      success: true,

      message:
        decision === "REQUIRED" ? "Material required" : "Material not required",

      complaint,
    });
  } catch (error) {
    console.error("MATERIAL DECISION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Could not update material decision",
    });
  }
};
