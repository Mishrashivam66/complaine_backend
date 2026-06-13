const express = require("express");

const router = express.Router();

// ==========================================
// CONTROLLERS
// ==========================================

const {
  createCategory,

  getCategories,

  updateCategory,

  deleteCategory,

  toggleCategoryStatus,
} = require("../../controllers/admin/categoryController");

// ==========================================
// MIDDLEWARE
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
// CREATE
// ==========================================

router.post(
  "/create",

  createCategory,
);

// ==========================================
// GET ALL
// ==========================================

router.get(
  "/all",

  getCategories,
);

// ==========================================
// UPDATE
// ==========================================

router.put(
  "/update/:id",

  updateCategory,
);

// ==========================================
// TOGGLE ACTIVE / INACTIVE
// ==========================================

router.put(
  "/toggle/:id",

  toggleCategoryStatus,
);

// ==========================================
// DELETE
// ==========================================

router.delete(
  "/delete/:id",

  deleteCategory,
);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
