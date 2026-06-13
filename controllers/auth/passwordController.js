const crypto = require("crypto");

const User = require("../../models/User");

const sendEmail = require("../../utils/sendEmail");

// ==========================================
// FORGOT PASSWORD
// ==========================================

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // ==========================================
    // FIND USER
    // ==========================================

    const user = await User.findOne({
      email,
    });

    if (!user) {
      return res.status(404).json({
        success: false,

        message: "User not found",
      });
    }

    // ==========================================
    // GENERATE RESET TOKEN
    // ==========================================

    const resetToken = crypto.randomBytes(32).toString("hex");

    // ==========================================
    // SAVE TOKEN
    // ==========================================

    user.resetPasswordToken = resetToken;

    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000;

    await user.save();

    // ==========================================
    // RESET URL
    // ==========================================

    const resetURL = `http://localhost:5173/reset-password/${resetToken}`;

    // ==========================================
    // EMAIL MESSAGE
    // ==========================================

    const message = `

      <h2>Password Reset</h2>

      <p>
        Click below link to reset password
      </p>

      <a href="${resetURL}">
        Reset Password
      </a>

    `;

    // ==========================================
    // SEND EMAIL
    // ==========================================

    await sendEmail(
      user.email,

      "Password Reset Request",

      message,
    );

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      message: "Reset link sent to email",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// RESET PASSWORD
// ==========================================

const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;

    const { password } = req.body;

    // ==========================================
    // FIND USER
    // ==========================================

    const user = await User.findOne({
      resetPasswordToken: token,

      resetPasswordExpires: {
        $gt: Date.now(),
      },
    });

    if (!user) {
      return res.status(400).json({
        success: false,

        message: "Invalid or expired token",
      });
    }

    // ==========================================
    // UPDATE PASSWORD
    // ==========================================

    user.password = password;

    user.resetPasswordToken = null;

    user.resetPasswordExpires = null;

    await user.save();

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      message: "Password reset successful",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// CHANGE PASSWORD
// ==========================================

const changePassword = async (req, res) => {
  try {
    const {
      oldPassword,

      newPassword,
    } = req.body;

    // ==========================================
    // FIND USER
    // ==========================================

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,

        message: "User not found",
      });
    }

    // ==========================================
    // CHECK OLD PASSWORD
    // ==========================================

    const isMatch = await user.matchPassword(oldPassword);

    if (!isMatch) {
      return res.status(400).json({
        success: false,

        message: "Old password incorrect",
      });
    }

    // ==========================================
    // SET NEW PASSWORD
    // ==========================================

    user.password = newPassword;

    await user.save();

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      message: "Password changed successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
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
