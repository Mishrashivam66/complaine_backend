const express = require("express");

const router = express.Router();

// ==========================================
// CONTROLLER
// ==========================================

const {
  updateStudentProfile,
} = require("../../controllers/student/profileController");

// ==========================================
// MIDDLEWARE
// ==========================================

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

// ==========================================
// UPDATE PROFILE
// ==========================================

router.put(
  "/update-profile",

  protect,

  updateStudentProfile,
);

module.exports = router;
