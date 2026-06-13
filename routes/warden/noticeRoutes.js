const express = require("express");

const router = express.Router();

// ==========================================
// CONTROLLERS
// ==========================================

const {
  createNotice,
  getNotices,
  deleteNotice,
} = require("../../controllers/warden/noticeController");

// ==========================================
// MIDDLEWARE
// ==========================================

const { protect } = require("../../middleware/authMiddleware");

// ==========================================
// CREATE NOTICE
// ==========================================

router.post("/create", protect, createNotice);

// ==========================================
// GET NOTICES
// ==========================================

router.get("/", protect, getNotices);

// ==========================================
// DELETE NOTICE
// ==========================================

router.delete("/delete/:id", protect, deleteNotice);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
