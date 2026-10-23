"use strict";

const mongoose = require("mongoose");

const User = require("../../models/User");
const Block = require("../../models/Block");

// ==========================================
// ADMIN MANAGED ROLES
// ==========================================

const ADMIN_MANAGED_ROLES = new Set([
  "ADMIN",
  "MAINTENANCE_MANAGER",
  "STORE_MANAGER",
  "BLOCK_ADMIN",
]);

const PUBLIC_FIELDS = [
  "name",
  "email",
  "phone",
  "role",
  "designation",
  "employeeId",
  "department",
  "assignedBlock",
  "assignedHostel",
  "isActive",
  "isVerified",
  "isDeleted",
  "createdAt",
  "lastLogin",
].join(" ");

// ==========================================
// SAFE USER RESPONSE
// ==========================================

const safeUser = (user) => {
  const obj = user.toObject ? user.toObject() : user;

  return Object.fromEntries(
    ["_id", ...PUBLIC_FIELDS.split(" ")].map((key) => [key, obj[key]]),
  );
};

// ==========================================
// VALIDATE USER ID
// ==========================================

const validId = (req, res) => {
  if (mongoose.isValidObjectId(req.params.id)) {
    return true;
  }

  res.status(400).json({
    success: false,
    message: "Invalid user ID",
  });

  return false;
};

// ==========================================
// GET ADMIN MANAGED USER
// ==========================================

async function getManagedUser(req, res) {
  if (!validId(req, res)) {
    return null;
  }

  const user = await User.findById(req.params.id);

  if (!user || user.isDeleted) {
    res.status(404).json({
      success: false,
      message: "Account not found",
    });

    return null;
  }

  if (!ADMIN_MANAGED_ROLES.has(user.role)) {
    res.status(403).json({
      success: false,
      message:
        "This role is managed by its respective department, not Admin Manage Users",
    });

    return null;
  }

  return user;
}

// ==========================================
// PROTECT CRITICAL ADMIN ACCOUNTS
// ==========================================

async function guardCriticalAdmin(req, res, user) {
  if (String(req.user._id) === String(user._id)) {
    res.status(409).json({
      success: false,
      message: "You cannot deactivate or archive your own account",
    });

    return false;
  }

  if (user.role === "ADMIN" && user.isActive) {
    const count = await User.countDocuments({
      role: "ADMIN",
      isActive: true,
      isDeleted: {
        $ne: true,
      },
    });

    if (count <= 1) {
      res.status(409).json({
        success: false,
        message: "Cannot disable the last active Admin",
      });

      return false;
    }
  }

  return true;
}

// ==========================================
// GET ALL STAFF USERS
// ==========================================

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({
      // Students have their own page.
      role: {
        $ne: "STUDENT",
      },

      isDeleted: {
        $ne: true,
      },
    })
      .select(PUBLIC_FIELDS)
      .sort({
        createdAt: -1,
      })
      .lean();

    return res.json({
      success: true,
      totalUsers: users.length,
      users,
    });
  } catch (error) {
    console.error("GET STAFF USERS:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load users",
    });
  }
};

// ==========================================
// EDIT USER DETAILS
// ==========================================

exports.updateUser = async (req, res) => {
  try {
    const user = await getManagedUser(req, res);

    if (!user) return;

    const body = req.body || {};

    const name = String(body.name || "").trim();

    const email = String(body.email || "")
      .trim()
      .toLowerCase();

    if (
      !name ||
      name.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid name and email are required",
      });
    }

    // ======================================
    // DUPLICATE EMAIL
    // ======================================

    const duplicate = await User.exists({
      email,

      _id: {
        $ne: user._id,
      },
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: "Email already exists",
      });
    }

    // ======================================
    // ALLOWED EDITABLE FIELDS ONLY
    // ======================================

    const fields = {
      name,
      email,

      phone: String(body.phone ?? "").trim(),

      designation: String(body.designation ?? "").trim(),

      employeeId: String(body.employeeId ?? "").trim(),
    };

    if (
      fields.phone.length > 30 ||
      fields.designation.length > 120 ||
      fields.employeeId.length > 60
    ) {
      return res.status(400).json({
        success: false,
        message: "A field exceeds its permitted length",
      });
    }

    // ======================================
    // BLOCK ADMIN ASSIGNMENT
    // ======================================

    if (user.role === "BLOCK_ADMIN") {
      const code = String(body.assignedBlock || "")
        .trim()
        .toUpperCase();

      if (!code) {
        return res.status(400).json({
          success: false,
          message: "Block Admin requires an Academic Block",
        });
      }

      const block = await Block.exists({
        code,
        isActive: true,
        isDeleted: {
          $ne: true,
        },
      });

      if (!block) {
        return res.status(400).json({
          success: false,
          message: "Select an active Academic Block",
        });
      }

      fields.assignedBlock = code;
    }

    // ======================================
    // SAVE
    // ======================================

    // Do not accept role, password, isActive,
    // or other privileged fields here.

    Object.assign(user, fields);

    await user.save();

    return res.json({
      success: true,
      message: "Account details updated",
      user: safeUser(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Email already exists",
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("UPDATE STAFF USER:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update account",
    });
  }
};

// ==========================================
// ACTIVATE / DEACTIVATE USER
// ==========================================

exports.toggleUserStatus = async (req, res) => {
  try {
    const user = await getManagedUser(req, res);

    if (!user) return;

    if (user.isActive && !(await guardCriticalAdmin(req, res, user))) {
      return;
    }

    user.isActive = !user.isActive;

    await user.save();

    return res.json({
      success: true,

      message: user.isActive ? "Account activated" : "Account deactivated",

      user: safeUser(user),
    });
  } catch (error) {
    console.error("TOGGLE STAFF USER:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to change account status",
    });
  }
};

// ==========================================
// ARCHIVE USER
// ==========================================

exports.deleteUser = async (req, res) => {
  try {
    const user = await getManagedUser(req, res);

    if (!user) return;

    if (!(await guardCriticalAdmin(req, res, user))) {
      return;
    }

    // Soft delete only.
    user.isActive = false;
    user.isDeleted = true;

    user.deletedAt = new Date();
    user.deletedBy = req.user._id;

    await user.save();

    return res.json({
      success: true,
      message: "Account archived. Historical records preserved.",
    });
  } catch (error) {
    console.error("ARCHIVE STAFF USER:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to archive account",
    });
  }
};
