"use strict";

const User = require("../../models/User");
const Block = require("../../models/Block");

const ALLOWED = new Set([
  "ADMIN",
  "MAINTENANCE_MANAGER",
  "STORE_MANAGER",
  "BLOCK_ADMIN",
]);

exports.createUser = async (req, res) => {
  try {
    // Defense in depth.
    if (
      req.user?.role !== "ADMIN" ||
      req.user?.isActive === false ||
      req.user?.isDeleted === true
    ) {
      return res.status(403).json({
        success: false,
        message: "Only an active Admin can create users",
      });
    }

    const { name, email, password, role, assignedBlock } = req.body || {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      typeof role !== "string" ||
      !role.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Name, email, password and role are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const normalizedRole = role.trim().toUpperCase();

    if (!ALLOWED.has(normalizedRole)) {
      return res.status(403).json({
        success: false,
        message: "Role not permitted in Admin Create Users",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    let blockCode = "";

    if (normalizedRole === "BLOCK_ADMIN") {
      if (typeof assignedBlock !== "string" || !assignedBlock.trim()) {
        return res.status(400).json({
          success: false,
          message: "Assign a block to this Block Admin",
        });
      }

      blockCode = assignedBlock.trim().toUpperCase();

      const block = await Block.findOne({
        code: blockCode,
        isActive: true,
        isDeleted: { $ne: true },
      })
        .select("code")
        .lean();

      if (!block) {
        return res.status(400).json({
          success: false,
          message: "Select an active, configured academic block",
        });
      }
    }

    if (
      await User.exists({
        email: normalizedEmail,
      })
    ) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    // Hashing happens in User pre-save hook.
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: normalizedRole,
      assignedBlock: blockCode,
      isVerified: true,
      isApproved: true,
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: `${normalizedRole.replaceAll("_", " ")} account created`,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        assignedBlock: user.assignedBlock,
        isActive: user.isActive,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Account already exists",
      });
    }

    if (error?.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Invalid account details",
      });
    }

    console.error("ADMIN CREATE USER:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create user",
    });
  }
};
