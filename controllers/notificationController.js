const Notification = require("../models/Notification");

const { getIO } = require("../sockets/socket");

// ==========================================
// GET MY NOTIFICATIONS
// ==========================================

const getMyNotifications = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;

    const limit = Number(req.query.limit) || 20;

    const skip = (page - 1) * limit;

    const notifications = await Notification.find({
      receiver: req.user._id,
    })

      .sort({
        createdAt: -1,
      })

      .populate("sender", "name role profilePhoto")

      .skip(skip)

      .limit(limit);

    // ==========================================
    // UNREAD COUNT
    // ==========================================

    const unreadCount = await Notification.countDocuments({
      receiver: req.user._id,

      isRead: false,
    });

    // ==========================================
    // TOTAL COUNT
    // ==========================================

    const totalNotifications = await Notification.countDocuments({
      receiver: req.user._id,
    });

    res.status(200).json({
      success: true,

      currentPage: page,

      totalPages: Math.ceil(totalNotifications / limit),

      totalNotifications,

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
// GET UNREAD COUNT
// ==========================================

const getUnreadCount = async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({
      receiver: req.user._id,

      isRead: false,
    });

    res.status(200).json({
      success: true,

      unreadCount,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to fetch unread count",
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

    // ==========================================
    // SOCKET EVENT
    // ==========================================

    try {
      const io = getIO();

      io.to(req.user._id.toString()).emit(
        "notification_read",
        notification._id,
      );

      io.to(req.user._id.toString()).emit("notification_count_updated");
    } catch (socketError) {
      console.log("Socket Error:", socketError.message);
    }

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

    // ==========================================
    // SOCKET EVENT
    // ==========================================

    try {
      const io = getIO();

      io.to(req.user._id.toString()).emit(
        "notification_deleted",
        notification._id,
      );

      io.to(req.user._id.toString()).emit("notification_count_updated");
    } catch (socketError) {
      console.log("Socket Error:", socketError.message);
    }

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

    // ==========================================
    // SOCKET EVENT
    // ==========================================

    try {
      const io = getIO();

      io.to(req.user._id.toString()).emit("notification_count_updated");
    } catch (socketError) {
      console.log("Socket Error:", socketError.message);
    }

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

    // ==========================================
    // SOCKET EVENT
    // ==========================================

    try {
      const io = getIO();

      io.to(req.user._id.toString()).emit("notification_count_updated");
    } catch (socketError) {
      console.log("Socket Error:", socketError.message);
    }

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

  sender = null,

  title,

  message,

  type = "SYSTEM",

  priority = "LOW",

  relatedComplaint = null,

  relatedId = null,

  relatedModel = null,

  actionUrl = "/dashboard",

  isPermanent = false,
}) => {
  try {
    // ==========================================
    // SAVE NOTIFICATION
    // ==========================================

    const notification = await Notification.create({
      receiver,

      sender,

      title,

      message,

      type,

      priority,

      relatedComplaint,

      relatedId,

      relatedModel,

      actionUrl,

      isPermanent,
    });

    // ==========================================
    // POPULATE SENDER
    // ==========================================

    await notification.populate("sender", "name role profilePhoto");

    // ==========================================
    // SOCKET EMIT
    // ==========================================

    try {
      const io = getIO();

      io.to(receiver.toString()).emit("new_notification", notification);

      io.to(receiver.toString()).emit("notification_count_updated");

      console.log("Notification Sent Successfully");
    } catch (socketError) {
      console.log("Socket Error:", socketError.message);
    }

    return notification;
  } catch (error) {
    console.log("Realtime Notification Error:", error.message);
  }
};

module.exports = {
  getMyNotifications,

  getUnreadCount,

  markAsRead,

  deleteNotification,

  markAllAsRead,

  clearAllNotifications,

  sendRealtimeNotification,
};
