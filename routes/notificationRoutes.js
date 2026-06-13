const express = require("express");

const router = express.Router();

// ==========================================
// CONTROLLERS
// ==========================================

const {
  getMyNotifications,
  markAsRead,
  deleteNotification,
  markAllAsRead,
  clearAllNotifications,
} = require("../controllers/notificationController");

// ==========================================
// MIDDLEWARE
// ==========================================

const { protect } = require("../middleware/authMiddleware");

// ==========================================
// GET MY NOTIFICATIONS
// ==========================================

router.get(
  "/",

  protect,

  getMyNotifications,
);

// ==========================================
// MARK AS READ
// ==========================================

router.put(
  "/read/:id",

  protect,

  markAsRead,
);

// ==========================================
// MARK ALL AS READ
// ==========================================

router.put(
  "/read-all",

  protect,

  markAllAsRead,
);

// ==========================================
// DELETE NOTIFICATION
// ==========================================

router.delete(
  "/delete/:id",

  protect,

  deleteNotification,
);

// ==========================================
// CLEAR ALL NOTIFICATIONS
// ==========================================

router.delete(
  "/clear-all",

  protect,

  clearAllNotifications,
);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
