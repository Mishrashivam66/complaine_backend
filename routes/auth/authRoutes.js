const express = require("express");

const router = express.Router();

const {
  registerUser,
  loginUser,
  getMyProfile,
  updateProfile,
  verifyEmailOTP,
  resendOTP,
} = require("../../controllers/auth/authController");

const passwordRoutes = require("./passwordRoutes");

const { protect } = require("../../middleware/authMiddleware");

// REGISTER
router.post("/register", registerUser);

// LOGIN
router.post("/login", loginUser);

// VERIFY OTP
router.post("/verify-email-otp", verifyEmailOTP);

// RESEND OTP
router.post("/resend-otp", resendOTP);

// PROFILE
router.get("/profile", protect, getMyProfile);

// UPDATE PROFILE
router.put("/profile/update", protect, updateProfile);

// PASSWORD ROUTES
router.use("/password", passwordRoutes);

// TEST
router.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Auth Routes Working",
  });
});


module.exports = router;
