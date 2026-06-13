const express = require("express");

const router = express.Router();

// ==========================================
// CONTROLLERS
// ==========================================

const {
  createMenu,

  getMenus,

  deleteMenu,

  uploadMenuExcel,
} = require("../../controllers/mess/messMenuController");

// ==========================================
// MIDDLEWARE
// ==========================================

const {
  protect,

  authorizeRoles,
} = require("../../middleware/authMiddleware");

const upload = require("../../middleware/uploadMiddleware");

// ==========================================
// CREATE MENU
// ==========================================

router.post(
  "/create",

  protect,

  authorizeRoles("MESS_MANAGER", "ADMIN"),

  createMenu,
);

// ==========================================
// GET ALL MENUS
// ==========================================

router.get(
  "/",

  protect,

  getMenus,
);

// ==========================================
// UPLOAD EXCEL MENU
// ==========================================

router.post(
  "/upload",

  protect,

  authorizeRoles("MESS_MANAGER", "ADMIN"),

  upload.single("file"),

  uploadMenuExcel,
);

// ==========================================
// DELETE MENU
// ==========================================

router.delete(
  "/:id",

  protect,

  authorizeRoles("MESS_MANAGER", "ADMIN"),

  deleteMenu,
);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
