"use strict";

const mongoose = require("mongoose");
const Complaint = require("../../models/Complaint");
const User = require("../../models/User");
const sendNotification = require("../../utils/sendNotification");

// ======================================================
// AMI MAINT. — TECHNICIAN ACTIONS
// Work Done | Reopened Complaint Rework
// ======================================================

const getUserId = (req) => req.user?._id || req.user?.id;

const upper = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

function fail(res, status, message) {
  return res.status(status).json({
    success: false,
    message,
  });
}

async function notifySafely(payload) {
  try {
    await sendNotification(payload);
  } catch (error) {
    console.error("TECHNICIAN NOTIFICATION ERROR:", error.message);
  }
}

async function findActiveTechnician(req) {
  const technicianId = getUserId(req);

  if (!mongoose.isValidObjectId(technicianId)) {
    return null;
  }

  return User.findOne({
    _id: technicianId,
    role: "TECHNICIAN",
    isActive: { $ne: false },
    isDeleted: { $ne: true },
  }).select("_id name role status isActive isDeleted");
}

function technicianCanWork(technician) {
  return !["OFFLINE", "ON_LEAVE"].includes(upper(technician.status));
}

// ======================================================
// RESTART REOPENED COMPLAINT
// POST not required — status update uses PUT.
// ======================================================

exports.startRework = async (req, res) => {
  try {
    const complaintId = req.params.complaintId;

    if (!mongoose.isValidObjectId(complaintId)) {
      return fail(res, 400, "Invalid complaint ID");
    }

    const technician = await findActiveTechnician(req);

    if (!technician || !technicianCanWork(technician)) {
      return fail(res, 403, "Active and available Technician required");
    }

    const now = new Date();

    const complaint = await Complaint.findOneAndUpdate(
      {
        _id: complaintId,
        assignedTo: technician._id,
        status: "REOPENED",
      },
      {
        $set: {
          status: "IN_PROGRESS",
          startedAt: now,
        },
        $push: {
          statusHistory: {
            status: "IN_PROGRESS",
            changedBy: technician._id,
            changedAt: now,
          },
        },
      },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!complaint) {
      return fail(
        res,
        409,
        "Complaint is not currently reopened or assigned to you",
      );
    }

    return res.status(200).json({
      success: true,
      message: "Rework started successfully",
      complaint: {
        _id: complaint._id,
        complaintId: complaint.complaintId,
        status: complaint.status,
        startedAt: complaint.startedAt,
      },
    });
  } catch (error) {
    console.error("START REWORK ERROR:", error);

    return fail(res, 500, "Unable to start rework");
  }
};

// ======================================================
// MARK WORK DONE
// Only assigned Technician can submit.
// Student verification remains a separate operation.
// ======================================================

exports.markWorkDone = async (req, res) => {
  try {
    const complaintId = req.params.complaintId;
    const remarks = String(req.body?.remarks ?? "").trim();

    if (!mongoose.isValidObjectId(complaintId)) {
      return fail(res, 400, "Invalid complaint ID");
    }

    if (remarks.length < 5 || remarks.length > 1000) {
      return fail(res, 400, "Enter work remarks between 5 and 1000 characters");
    }

    const technician = await findActiveTechnician(req);

    if (!technician || !technicianCanWork(technician)) {
      return fail(res, 403, "Active and available Technician required");
    }

    // Important:
    // Work Done is allowed only after work has started.
    // No JobCard dependency is used here.
    const now = new Date();

    const complaint = await Complaint.findOneAndUpdate(
      {
        _id: complaintId,
        assignedTo: technician._id,
        status: "IN_PROGRESS",
      },
      {
        $set: {
          status: "COMPLETED",
          completedAt: now,
          workerRemarks: remarks,
        },
        $push: {
          statusHistory: {
            status: "COMPLETED",
            changedBy: technician._id,
            changedAt: now,
          },
        },
      },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!complaint) {
      return fail(
        res,
        409,
        "Complaint must be IN_PROGRESS and assigned to your account",
      );
    }

    const sender = technician._id;

    // Student verification must happen on the Student side.
    // Technician must not set RESOLVED or CLOSED.

    const recipients = [complaint.student, complaint.createdBy].filter(Boolean);

    const uniqueStudentIds = [...new Set(recipients.map(String))];

    const notifications = uniqueStudentIds.map((receiver) =>
      notifySafely({
        receiver,
        sender,
        title: "Maintenance Work Completed",
        message:
          `Technician completed ${complaint.complaintId}. ` +
          "Please verify whether your issue is resolved.",
        type: "STATUS_UPDATE",
        relatedComplaint: complaint._id,
        actionUrl: "/complaints",
      }),
    );

    // Inform Maintenance Managers as well.
    const managers = await User.find({
      role: "MAINTENANCE_MANAGER",
      isActive: { $ne: false },
    })
      .select("_id")
      .lean();

    managers.forEach((manager) => {
      notifications.push(
        notifySafely({
          receiver: manager._id,
          sender,
          title: "Technician Marked Work Done",
          message:
            `${complaint.complaintId} was marked Work Done. ` +
            "Student confirmation is pending.",
          type: "STATUS_UPDATE",
          relatedComplaint: complaint._id,
          actionUrl: "/maintenance/complaints",
        }),
      );
    });

    await Promise.allSettled(notifications);

    return res.status(200).json({
      success: true,
      message: "Work Done submitted. Awaiting Student confirmation.",
      complaint: {
        _id: complaint._id,
        complaintId: complaint.complaintId,
        status: complaint.status,
        completedAt: complaint.completedAt,
        workerRemarks: complaint.workerRemarks,
      },
    });
  } catch (error) {
    console.error("MARK WORK DONE ERROR:", error);

    return fail(res, 500, "Unable to complete work");
  }
};
