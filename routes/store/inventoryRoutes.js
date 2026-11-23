"use strict";

const express = require("express");
const router = express.Router();

const { protect } = require("../../middleware/authMiddleware");

const roleMiddleware = require("../../middleware/roleMiddleware");

const {
  addInventory,
} = require("../../controllers/store/addInventoryController");

const {
  getInventoryItems,
  getSingleInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getLowStockItems,
} = require("../../controllers/store/inventoryController");

const {
  getInventoryCategories,
  getCategoryManagement,
  createInventoryCategory,
  renameInventoryCategory,
  deleteInventoryCategory,
  bulkAssignInventoryCategory,
} = require("../../controllers/store/inventoryCategoryController");

// ==========================================
// SECURITY
// ==========================================

router.use(protect);

router.use(roleMiddleware("STORE_MANAGER"));

// ==========================================
// ADD INVENTORY
// ==========================================

router.post("/add", addInventory);

router.post("/create", addInventory);

// ==========================================
// CATEGORY MASTER
// ==========================================

// Dropdown categories
router.get("/categories", getInventoryCategories);

// Category management
router.get("/category-management", getCategoryManagement);

// Create category
router.post("/categories", createInventoryCategory);

// Rename category
router.put("/categories/rename", renameInventoryCategory);

// Delete category
router.delete("/categories/delete", deleteInventoryCategory);

router.put("/categories/bulk-assign", bulkAssignInventoryCategory);
// ==========================================
// INVENTORY MANAGEMENT
// ==========================================

router.get("/all", getInventoryItems);

router.get("/low-stock", getLowStockItems);

// Keep dynamic ID routes LAST.

router.get("/:id", getSingleInventoryItem);

router.put("/:id", updateInventoryItem);

router.delete("/:id", deleteInventoryItem);

module.exports = router;
