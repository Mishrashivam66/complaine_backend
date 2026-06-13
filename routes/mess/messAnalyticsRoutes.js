const express = require("express");

const router = express.Router();

const {
  getMessAnalytics,
} = require("../../controllers/mess/messAnalyticsController");

const {
  protect,

  authorizeRoles,
} = require("../../middleware/authMiddleware");

// ==========================================
// GET ANALYTICS
// ==========================================

router.get(
  "/",

  protect,

  authorizeRoles("MESS_MANAGER", "ADMIN"),

  getMessAnalytics,
);

module.exports = router;
