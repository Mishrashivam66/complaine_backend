const express = require("express");

const router = express.Router();

// ==========================================
// CONTROLLERS
// ==========================================

const {
  forgotPassword,

  resetPassword,

  changePassword,
} = require("../../controllers/auth/passwordController");

// ==========================================
// MIDDLEWARE
// ==========================================

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

// ==========================================
// FORGOT PASSWORD
// ==========================================

router.post("/forgot-password", forgotPassword);

// ==========================================
// RESET PASSWORD
// ==========================================

router.post("/reset-password/:token", resetPassword);

// ==========================================
// CHANGE PASSWORD
// ==========================================

router.put("/change-password", protect, changePassword);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
