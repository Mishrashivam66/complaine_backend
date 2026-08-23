const crypto = require("crypto");

const User = require("../../models/User");

const sendEmail = require("../../utils/sendEmail");

// ==========================================
// FORGOT PASSWORD
// ==========================================

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // ======================================
    // VALIDATION
    // ======================================

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // ======================================
    // FIND USER
    // ======================================

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ======================================
    // GENERATE RESET TOKEN
    // ======================================

    const resetToken = crypto.randomBytes(32).toString("hex");

    // ======================================
    // SAVE TOKEN
    // ======================================

    user.resetPasswordToken = resetToken;

    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000;

    await user.save();

    // ======================================
    // RESET URL
    // IMPORTANT:
    // This must match frontend React route
    // /reset-password/:token
    // ======================================

    const resetURL = `https://university-complain-frontend.vercel.app/reset-password/${resetToken}`;

    // ======================================
    // EMAIL MESSAGE
    // ======================================

    const message = `
      <div
        style="
          font-family: Arial, sans-serif;
          max-width: 520px;
          margin: auto;
          padding: 24px;
        "
      >
        <h2
          style="
            color: #001B54;
          "
        >
          Password Reset
        </h2>

        <p>
          We received a request to reset your
          CampusPulse password.
        </p>

        <p>
          Click the button below to create a
          new password.
        </p>

        <a
          href="${resetURL}"
          style="
            display: inline-block;
            margin-top: 10px;
            padding: 12px 20px;
            background: #001B54;
            color: #ffffff;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
          "
        >
          Reset Password
        </a>

        <p
          style="
            margin-top: 20px;
            font-size: 13px;
            color: #666;
          "
        >
          This link will expire in 15 minutes.
        </p>

        <p
          style="
            font-size: 12px;
            color: #888;
            word-break: break-all;
          "
        >
          ${resetURL}
        </p>
      </div>
    `;

    // ======================================
    // SEND EMAIL
    // ======================================

    await sendEmail(user.email, "Password Reset Request", message);

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,
      message: "Reset link sent to email",
    });
  } catch (error) {
    console.log("FORGOT PASSWORD ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to send reset link",
    });
  }
};

// ==========================================
// RESET PASSWORD
// ==========================================

const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;

    const { password, confirmPassword } = req.body;

    // ======================================
    // VALIDATION
    // ======================================

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Reset token is required",
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "New password is required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Password and Confirm Password do not match",
      });
    }

    // ======================================
    // FIND USER WITH VALID TOKEN
    // ======================================

    const user = await User.findOne({
      resetPasswordToken: token,

      resetPasswordExpires: {
        $gt: Date.now(),
      },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset link",
      });
    }

    // ======================================
    // UPDATE PASSWORD
    // ======================================

    user.password = password;

    user.resetPasswordToken = null;

    user.resetPasswordExpires = null;

    await user.save();

    // Password gets hashed automatically
    // by User model pre("save") hook.

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,
      message:
        "Password reset successfully. Please login with your new password.",
    });
  } catch (error) {
    console.log("RESET PASSWORD ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to reset password",
    });
  }
};

// ==========================================
// CHANGE PASSWORD
// ==========================================

const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    // ======================================
    // VALIDATION
    // ======================================

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Old password and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters",
      });
    }

    // ======================================
    // FIND USER
    // ======================================

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ======================================
    // CHECK OLD PASSWORD
    // ======================================

    const isMatch = await user.matchPassword(oldPassword);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Old password incorrect",
      });
    }

    // ======================================
    // SET NEW PASSWORD
    // ======================================

    user.password = newPassword;

    await user.save();

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.log("CHANGE PASSWORD ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to change password",
    });
  }
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  forgotPassword,
  resetPassword,
  changePassword,
};
