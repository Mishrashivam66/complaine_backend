const EmergencyAlert = require("../../models/EmergencyAlert");

const Announcement = require("../../models/Announcement");

const createEmergencyAlert = async (req, res) => {
  try {
    const {
      type,

      hostel,

      room,

      message,
    } = req.body;

    // VALIDATION

    if (!type || !hostel || !message) {
      return res.status(400).json({
        success: false,

        message: "All required fields are mandatory",
      });
    }

    // CREATE ALERT

    const alert = await EmergencyAlert.create({
      student: req.user._id,

      hostel,

      room,

      type,

      message,

      status: "Active",
    });

    res.status(201).json({
      success: true,

      message: "Emergency Alert Created",

      alert,
    });
  } catch (error) {
    console.log("CREATE ALERT ERROR:", error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// GET ALERTS + ANNOUNCEMENTS
// ==========================================

const getEmergencyAlerts = async (req, res) => {
  try {
    const hostel = req.user.assignedHostel || req.user.hostel;

    // ==========================================
    // ALERTS
    // ==========================================

    const alerts = await EmergencyAlert.find({
      hostel,
    })
      .populate("student", "name email")
      .sort({
        createdAt: -1,
      });

    // ==========================================
    // ANNOUNCEMENTS
    // ==========================================

    const announcements = await Announcement.find().sort({
      createdAt: -1,
    });

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      alerts,

      announcements,
    });
  } catch (error) {
    console.log("GET EMERGENCY ERROR:", error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// UPDATE ALERT STATUS
// ==========================================

const updateAlertStatus = async (req, res) => {
  try {
    const alert = await EmergencyAlert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({
        success: false,

        message: "Alert not found",
      });
    }

    alert.status = req.body.status;

    await alert.save();

    res.status(200).json({
      success: true,

      message: "Alert updated successfully",

      alert,
    });
  } catch (error) {
    console.log("UPDATE ALERT ERROR:", error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// DELETE ALERT
// ==========================================

const deleteAlert = async (req, res) => {
  try {
    const alert = await EmergencyAlert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({
        success: false,

        message: "Alert not found",
      });
    }

    await alert.deleteOne();

    res.status(200).json({
      success: true,

      message: "Alert deleted successfully",
    });
  } catch (error) {
    console.log("DELETE ALERT ERROR:", error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

module.exports = {
  getEmergencyAlerts,

  createEmergencyAlert,

  updateAlertStatus,

  deleteAlert,
};
