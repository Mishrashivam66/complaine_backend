const express = require("express");

const router = express.Router();

const {
  getHostelDetails,
} = require("../../controllers/student/hostelController");

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

// ==========================================
// GET HOSTEL DETAILS
// ==========================================

router.get(
  "/details",

  protect,

  getHostelDetails,
);

module.exports = router;
