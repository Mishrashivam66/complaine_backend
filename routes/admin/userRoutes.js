"use strict";

const express = require("express");

const router = express.Router();

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

const {
  getAllUsers,
  updateUser,
  toggleUserStatus,
  deleteUser,
} = require("../../controllers/admin/userController");

// ==========================================
// ADMIN AUTHENTICATION
// ==========================================

router.use(protect);

router.use(authorizeRoles("ADMIN"));

// ==========================================
// GET ALL STAFF ACCOUNTS
// ==========================================

router.get("/", getAllUsers);

// ==========================================
// ACTIVATE / DEACTIVATE
// ==========================================

router.put("/status/:id", toggleUserStatus);

// ==========================================
// EDIT ACCOUNT
// ==========================================

router.put("/:id", updateUser);

// ==========================================
// ARCHIVE ACCOUNT
// ==========================================

router.delete("/:id", deleteUser);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
