"use strict";

const mongoose = require("mongoose");
const User = require("../../models/User");

const PUBLIC_FIELDS =
  "name email phone role assignedBlock assignedHostel hostel department designation isActive isVerified isDeleted createdAt lastLogin";

// ==========================================
// GET ALL USERS
// ==========================================

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({
      isDeleted: { $ne: true },
    })
      .select(PUBLIC_FIELDS)
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      totalUsers: users.length,
      users,
    });
  } catch (error) {
    console.error("GET USERS:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load users",
    });
  }
};

// ==========================================
// ADMIN SAFETY
// ==========================================

async function checkAdminSafety(user, actorId, action) {
  if (String(user._id) === String(actorId)) {
    return `You cannot ${action} your own account`;
  }

  if (user.role === "ADMIN" && user.isActive && !user.isDeleted) {
    const activeAdmins = await User.countDocuments({
      role: "ADMIN",
      isActive: true,
      isDeleted: { $ne: true },
    });

    if (activeAdmins <= 1) {
      return "Cannot disable the last active Admin";
    }
  }

  return null;
}

// ==========================================
// ARCHIVE USER
// ==========================================

exports.deleteUser = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const user = await User.findById(req.params.id);

    if (!user || user.isDeleted === true) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const refusal = await checkAdminSafety(user, req.user._id, "archive");

    if (refusal) {
      return res.status(409).json({
        success: false,
        message: refusal,
      });
    }

    user.isActive = false;
    user.isDeleted = true;
    user.deletedAt = new Date();
    user.deletedBy = req.user._id;

    await user.save();

    return res.json({
      success: true,
      message: "User archived; historical records preserved",
    });
  } catch (error) {
    console.error("ARCHIVE USER:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to archive user",
    });
  }
};

// ==========================================
// TOGGLE ACCOUNT STATUS
// ==========================================

exports.toggleUserStatus = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const user = await User.findById(req.params.id);

    if (!user || user.isDeleted === true) {
      return res.status(404).json({
        success: false,
        message: "User not found or archived",
      });
    }

    if (user.isActive) {
      const refusal = await checkAdminSafety(user, req.user._id, "deactivate");

      if (refusal) {
        return res.status(409).json({
          success: false,
          message: refusal,
        });
      }
    }

    user.isActive = !user.isActive;

    await user.save();

    return res.json({
      success: true,
      message: user.isActive ? "User activated" : "User deactivated",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    console.error("CHANGE USER STATUS:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update user status",
    });
  }
};
