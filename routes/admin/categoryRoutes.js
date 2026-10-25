"use strict";

const express = require("express");
const router = express.Router();

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

const {
  createCategory,
  getCategories,
  getActiveCategories,
  getCategoryDependencies,
  updateCategory,
  deleteCategory,
  restoreCategory,
  permanentDeleteCategory,
  toggleCategoryStatus,
} = require("../../controllers/admin/categoryController");

router.use(protect);

// Active maintenance categories for authenticated
// Student, Warden, Technician and other portals.
router.get("/active", getActiveCategories);

// Admin and Maintenance Manager can read categories.
router.get(
  "/all",
  authorizeRoles("ADMIN", "MAINTENANCE_MANAGER"),
  getCategories,
);

// Only ADMIN can modify category master data.
router.use(authorizeRoles("ADMIN"));

router.post("/create", createCategory);

router.get("/dependencies/:id", getCategoryDependencies);

router.put("/update/:id", updateCategory);

router.put("/toggle/:id", toggleCategoryStatus);

// Legacy URL now archives.
router.delete("/delete/:id", deleteCategory);

router.patch("/restore/:id", restoreCategory);

router.delete("/permanent/:id", permanentDeleteCategory);

module.exports = router;
