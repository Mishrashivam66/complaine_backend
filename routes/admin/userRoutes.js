const express = require("express");

const router = express.Router();

// ==========================================
// CONTROLLERS
// ==========================================

const {
  getAllUsers,

  deleteUser,

  toggleUserStatus,
} = require("../../controllers/admin/userController");

// ==========================================
// MIDDLEWARES
// ==========================================

const {
  protect,

  authorizeRoles,
} = require("../../middleware/authMiddleware");

// ==========================================
// ADMIN ACCESS
// ==========================================

router.use(protect);

router.use(authorizeRoles("ADMIN", "SUPER_ADMIN"));

// ==========================================
// GET USERS
// ==========================================

router.get("/", getAllUsers);

// ==========================================
// DELETE USER
// ==========================================

router.delete("/:id", deleteUser);

// ==========================================
// TOGGLE STATUS
// ==========================================

router.put("/status/:id", toggleUserStatus);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
