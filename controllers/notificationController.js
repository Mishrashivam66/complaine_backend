const Notification = require("../models/Notification");

const { getIO } = require("../sockets/socket");

// ==========================================
// GET MY NOTIFICATIONS
// ==========================================

const getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      receiver: req.user._id,
    })

      .sort({
        createdAt: -1,
      })

      .populate(
        "sender",

        "name role profilePhoto",
      )

      .limit(100);

    // ==========================================
    // UNREAD COUNT
    // ==========================================

    const unreadCount = await Notification.countDocuments({
      receiver: req.user._id,

      isRead: false,
    });

    res.status(200).json({
      success: true,

      count: notifications.length,

      unreadCount,

      notifications,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to fetch notifications",
    });
  }
};

// ==========================================
// MARK AS READ
// ==========================================

const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,

        message: "Notification not found",
      });
    }

    // ==========================================
    // SECURITY CHECK
    // ==========================================

    if (notification.receiver.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,

        message: "Unauthorized",
      });
    }

    notification.isRead = true;

    await notification.save();

    res.status(200).json({
      success: true,

      message: "Notification marked as read",

      notification,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to update notification",
    });
  }
};

// ==========================================
// DELETE NOTIFICATION
// ==========================================

const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,

        message: "Notification not found",
      });
    }

    // ==========================================
    // SECURITY CHECK
    // ==========================================

    if (notification.receiver.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,

        message: "Unauthorized",
      });
    }

    await notification.deleteOne();

    res.status(200).json({
      success: true,

      message: "Notification deleted successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to delete notification",
    });
  }
};

// ==========================================
// MARK ALL AS READ
// ==========================================

const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      {
        receiver: req.user._id,

        isRead: false,
      },

      {
        isRead: true,
      },
    );

    res.status(200).json({
      success: true,

      message: "All notifications marked as read",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to update notifications",
    });
  }
};

// ==========================================
// CLEAR ALL NOTIFICATIONS
// ==========================================

const clearAllNotifications = async (req, res) => {
  try {
    await Notification.deleteMany({
      receiver: req.user._id,
    });

    res.status(200).json({
      success: true,

      message: "All notifications cleared",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to clear notifications",
    });
  }
};

// ==========================================
// SEND REALTIME NOTIFICATION
// ==========================================

const sendRealtimeNotification = async ({
  receiver,
  sender,
  title,
  message,
  type,
  relatedComplaint = null,
}) => {
  try {
    // ==========================================
    // SAVE DB
    // ==========================================

    const notification = await Notification.create({
      receiver,

      sender,

      title,

      message,

      type,

      relatedComplaint,
    });

    // ==========================================
    // SOCKET EMIT
    // ==========================================

    const io = getIO();

    io.to(receiver.toString()).emit(
      "newNotification",

      notification,
    );

    console.log("Notification Sent Successfully");

    return notification;
  } catch (error) {
    console.log("Realtime Notification Error:", error.message);
  }
};

module.exports = {
  getMyNotifications,

  markAsRead,

  deleteNotification,

  markAllAsRead,

  clearAllNotifications,

  sendRealtimeNotification,
};
