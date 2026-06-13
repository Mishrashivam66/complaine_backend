const express = require("express");

const router = express.Router();

const {
  createAnnouncement,
  getAnnouncements,
  deleteAnnouncement,
} = require("../../controllers/admin/announcementController");

const { protect } = require("../../middleware/authMiddleware");

// ======================================
// CREATE
// ======================================

router.post("/create", protect, createAnnouncement);

// ======================================
// GET
// ======================================

router.get("/all", protect, getAnnouncements);

// ======================================
// DELETE
// ======================================

router.delete("/delete/:id", protect, deleteAnnouncement);

module.exports = router;
