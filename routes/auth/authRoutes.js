const express = require("express");

const router = express.Router();

// ==========================================
// AUTH CONTROLLER
// ==========================================

const {
  registerUser,

  loginUser,

  getMyProfile,

  updateProfile,
} = require("../../controllers/auth/authController");

// ==========================================
// PASSWORD ROUTES
// ==========================================

const passwordRoutes = require("./passwordRoutes");

// ==========================================
// MIDDLEWARE
// ==========================================

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

// ==========================================
// AUTH ROUTES
// ==========================================

// REGISTER

router.post("/register", registerUser);

// LOGIN

router.post("/login", loginUser);

// PROFILE

router.get("/profile", protect, getMyProfile);

// UPDATE PROFILE

router.put("/profile/update", protect, updateProfile);

// ==========================================
// PASSWORD ROUTES
// ==========================================

router.use("/password", passwordRoutes);

// ==========================================
// TEST ROUTE
// ==========================================

router.get("/", (req, res) => {
  res.json({
    success: true,

    message: "Auth Routes Working",
  });
});

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
