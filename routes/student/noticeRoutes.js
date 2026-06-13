const express = require("express");

const router = express.Router();

const {
  getAnnouncements,
} = require("../../controllers/admin/announcementController");

const { protect } = require("../../middleware/authMiddleware");

// ==========================================
// GET ALL ANNOUNCEMENTS
// ==========================================

router.get(
  "/",

  protect,

  getAnnouncements,
);

module.exports = router;
