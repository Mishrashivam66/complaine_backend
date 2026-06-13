const express = require("express");

const router = express.Router();

// ==========================================
// CONTROLLERS
// ==========================================

const {
  createHistory,

  getStudentHistory,

  getSingleHistory,

  updateHistoryStatus,

  deleteHistory,
} = require("../../controllers/warden/studentHistoryController");

// ==========================================
// MIDDLEWARE
// ==========================================

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

// ==========================================
// CREATE HISTORY
// ==========================================

router.post(
  "/create",

  protect,

  authorizeRoles("WARDEN", "ADMIN", "SUPER_ADMIN"),

  createHistory,
);

// ==========================================
// GET ALL HISTORY
// ==========================================

router.get(
  "/",

  protect,

  authorizeRoles("WARDEN", "ADMIN", "SUPER_ADMIN"),

  getStudentHistory,
);

// ==========================================
// GET SINGLE HISTORY
// ==========================================

router.get(
  "/:id",

  protect,

  authorizeRoles("WARDEN", "ADMIN", "SUPER_ADMIN"),

  getSingleHistory,
);

// ==========================================
// UPDATE STATUS
// ==========================================

router.put(
  "/:id/status",

  protect,

  authorizeRoles("WARDEN", "ADMIN", "SUPER_ADMIN"),

  updateHistoryStatus,
);

// ==========================================
// DELETE HISTORY
// ==========================================

router.delete(
  "/:id",

  protect,

  authorizeRoles("WARDEN", "ADMIN", "SUPER_ADMIN"),

  deleteHistory,
);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
