const express = require("express");

const router = express.Router();

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

const {
  getBlockComplaints,
} = require("../../controllers/blockAdmin/blockAdminController");

// Authentication + role authorization
router.use(protect);
router.use(authorizeRoles("BLOCK_ADMIN"));

// Read-only monitoring
router.get("/complaints", getBlockComplaints);

module.exports = router;
