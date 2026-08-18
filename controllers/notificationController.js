const Notification = require("../models/Notification");

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

    const unreadCount = await Notification.countDocuments({
      receiver: req.user._id,
      isRead: false,
    });

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
// CREATE NOTIFICATION
// ==========================================

const sendNotification = async ({
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

    await notification.populate("sender", "name role profilePhoto");

    return notification;
  } catch (error) {
    console.log("Notification Error:", error.message);

    return null;
  }
};

module.exports = {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  deleteNotification,
  markAllAsRead,
  clearAllNotifications,
  sendNotification,
};
