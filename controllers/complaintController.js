const Complaint = require("../models/Complaint");
const sendNotification =
require("../utils/sendNotification");

// Create Complaint
const createComplaint = async (req, res) => {
  try {

    const complaint = await Complaint.create({
      ...req.body,
      complaintId:
        "CMP-" +
        Date.now().toString().slice(-6),
    });

    // Notification
    await sendNotification({
      user: "6a17cd9175dc49fecd7b8492", // Temporary Super Admin ID
      title: "New Complaint",
      message: `Complaint Created: ${complaint.title}`,
      type: "COMPLAINT",
    });

    res.status(201).json({
      success: true,
      complaint,
    });

  } catch (error) {

    res.status(500).json({
      message: error.message,
    });

  }
};

// Get All Complaints
const getAllComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find()
      .populate("createdBy")
      .populate("assignedWorker")
      .populate("department")
      .populate("category")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      complaints,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Get Single Complaint
const getComplaintById = async (req, res) => {
  try {
    const complaint =
      await Complaint.findById(
        req.params.id
      );

    if (!complaint) {
      return res.status(404).json({
        message: "Complaint not found",
      });
    }

    res.status(200).json({
      success: true,
      complaint,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  createComplaint,
  getAllComplaints,
  getComplaintById,
};