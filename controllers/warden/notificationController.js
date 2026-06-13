const Notification = require("../../models/Notification");

// ==========================================
// GET ALL NOTIFICATIONS
// ==========================================

exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find().sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      count: notifications.length,
      notifications,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================================
// CREATE NOTIFICATION
// ==========================================

exports.createNotification = async (req, res) => {
  try {
    const { title, message, type, audience } = req.body;

    const notification = await Notification.create({
      title,

      message,

      type,

      audience,

      createdBy: req.user._id || req.user.id,
    });

    res.status(201).json({
      success: true,
      message: "Notification created successfully",
      notification,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================================
// MARK AS READ
// ==========================================

exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,

      {
        status: "READ",
      },

      {
        new: true,
      },
    );

    if (!notification) {
      return res.status(404).json({
        success: false,

        message: "Notification not found",
      });
    }

    res.status(200).json({
      success: true,

      message: "Notification marked as read",

      notification,
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// DELETE NOTIFICATION
// ==========================================

exports.deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    await notification.deleteOne();

    res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
