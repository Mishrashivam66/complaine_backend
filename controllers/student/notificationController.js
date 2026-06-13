const Notification = require("../../models/Notification");

// ==========================================
// GET ALL USER NOTIFICATIONS
// ==========================================

const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      user: req.params.userId,
    })

      .sort({
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

const createNotification = async ({
  user,
  title,
  message,
  type = "SYSTEM",
}) => {
  try {
    const notification = await Notification.create({
      user,

      title,

      message,

      type,
    });

    return notification;
  } catch (error) {
    console.log(error.message);
  }
};

// ==========================================
// MARK AS READ
// ==========================================

const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,

      {
        isRead: true,
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

const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,

        message: "Notification not found",
      });
    }

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

const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      {
        user: req.params.userId,

        isRead: false,
      },

      {
        $set: {
          isRead: true,
        },
      },
    );

    res.status(200).json({
      success: true,

      message: "All notifications marked as read",
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

module.exports = {
  getNotifications,

  createNotification,

  markAsRead,
  markAllAsRead,

  deleteNotification,
};
