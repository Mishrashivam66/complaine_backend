const User = require("../../models/User");

// ==========================================
// GET ALL USERS
// ==========================================

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({
      createdAt: -1,
    });

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      totalUsers: users.length,

      users,
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
// DELETE USER
// ==========================================

const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,

        message: "User not found",
      });
    }

    // ==========================================
    // DELETE USER
    // ==========================================

    await User.findByIdAndDelete(req.params.id);

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      message: "User deleted successfully",
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
// TOGGLE USER STATUS
// ==========================================

const toggleUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,

        message: "User not found",
      });
    }

    // ==========================================
    // TOGGLE STATUS
    // ==========================================

    user.isActive = !user.isActive;

    await user.save();

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      message: user.isActive ? "User activated" : "User deactivated",

      user,
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
  getAllUsers,

  deleteUser,

  toggleUserStatus,
};
