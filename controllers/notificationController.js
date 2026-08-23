const Notification = require("../models/Notification");

// ==========================================
// GET MY NOTIFICATIONS
// ==========================================

const getMyNotifications = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);

    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

    const skip = (page - 1) * limit;

    // ======================================
    // FETCH NOTIFICATIONS + COUNTS
    // ======================================

    const [notifications, unreadCount, totalNotifications] = await Promise.all([
      // ====================================
      // NOTIFICATIONS
      // ====================================

      Notification.find({
        receiver: req.user._id,
      })
        .sort({
          createdAt: -1,
        })
        .populate("sender", "name role profilePhoto")
        .skip(skip)
        .limit(limit),

      // ====================================
      // UNREAD COUNT
      // ====================================

      Notification.countDocuments({
        receiver: req.user._id,
        isRead: false,
      }),

      // ====================================
      // TOTAL COUNT
      // ====================================

      Notification.countDocuments({
        receiver: req.user._id,
      }),
    ]);

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      currentPage: page,

      totalPages: Math.ceil(totalNotifications / limit),

      totalNotifications,

      unreadCount,

      notifications,
    });
  } catch (error) {
    console.log("GET NOTIFICATIONS ERROR:", error);

    return res.status(500).json({
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

    return res.status(200).json({
      success: true,

      unreadCount,
    });
  } catch (error) {
    console.log("GET UNREAD COUNT ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to fetch unread count",
    });
  }
};

// ==========================================
// MARK SINGLE NOTIFICATION AS READ
// ==========================================

const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,

        receiver: req.user._id,
      },

      {
        $set: {
          isRead: true,
        },
      },

      {
        new: true,
      },
    ).populate("sender", "name role profilePhoto");

    // ======================================
    // NOT FOUND
    // ======================================

    if (!notification) {
      return res.status(404).json({
        success: false,

        message: "Notification not found",
      });
    }

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      message: "Notification marked as read",

      notification,
    });
  } catch (error) {
    console.log("MARK NOTIFICATION READ ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to update notification",
    });
  }
};

// ==========================================
// MARK ALL AS READ
// ==========================================

const markAllAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      {
        receiver: req.user._id,

        isRead: false,
      },

      {
        $set: {
          isRead: true,
        },
      },
    );

    return res.status(200).json({
      success: true,

      message: "All notifications marked as read",

      updatedCount: result.modifiedCount || 0,
    });
  } catch (error) {
    console.log("MARK ALL READ ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to update notifications",
    });
  }
};

// ==========================================
// DELETE SINGLE NOTIFICATION
// ==========================================

const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,

      receiver: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,

        message: "Notification not found",
      });
    }

    return res.status(200).json({
      success: true,

      message: "Notification deleted successfully",
    });
  } catch (error) {
    console.log("DELETE NOTIFICATION ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to delete notification",
    });
  }
};

// ==========================================
// CLEAR ALL NOTIFICATIONS
// ==========================================

const clearAllNotifications = async (req, res) => {
  try {
    const result = await Notification.deleteMany({
      receiver: req.user._id,
    });

    return res.status(200).json({
      success: true,

      message: "All notifications cleared",

      deletedCount: result.deletedCount || 0,
    });
  } catch (error) {
    console.log("CLEAR NOTIFICATIONS ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to clear notifications",
    });
  }
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  getMyNotifications,

  getUnreadCount,

  markAsRead,

  markAllAsRead,

  deleteNotification,

  clearAllNotifications,
};
