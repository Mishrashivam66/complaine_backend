"use strict";

const express = require("express");
const router = express.Router();

// ==========================================
// AUTHENTICATION & AUTHORIZATION
// ==========================================

const { protect } = require("../../middleware/authMiddleware");

const roleMiddleware = require("../../middleware/roleMiddleware");

// ==========================================
// ADD INVENTORY CONTROLLER
// ==========================================

const {
  addInventory,
  getInventoryCategories,
} = require("../../controllers/store/addInventoryController");

// ==========================================
// INVENTORY CONTROLLER
// ==========================================

const {
  getInventoryItems,
  getSingleInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getLowStockItems,
} = require("../../controllers/store/inventoryController");

// ==========================================
// NEW CATEGORY MANAGEMENT CONTROLLER
// ==========================================

const {
  getCategoryManagement,
  renameInventoryCategory,
  deleteInventoryCategory,
} = require("../../controllers/store/inventoryCategoryController");

// ==========================================
// STORE MANAGER ONLY
// ==========================================

router.use(protect);
router.use(roleMiddleware("STORE_MANAGER"));

// ==========================================
// CREATE INVENTORY MASTER
// ==========================================

// Create material with zero opening stock
router.post("/add", addInventory);

// Compatibility alias
router.post("/create", addInventory);

// ==========================================
// DYNAMIC CATEGORY DROPDOWN
// ==========================================

// Existing categories for Add Inventory
router.get("/categories", getInventoryCategories);

// ==========================================
// NEW CATEGORY MANAGEMENT
// ==========================================

// View categories with material counts
router.get("/category-management", getCategoryManagement);

// Rename an existing custom category
router.put("/categories/rename", renameInventoryCategory);

// Remove a custom category by reassigning
// its inventory materials safely
router.delete("/categories/delete", deleteInventoryCategory);

// ==========================================
// INVENTORY MANAGEMENT
// ==========================================

// Get all inventory materials
router.get("/all", getInventoryItems);

// Get low-stock materials
router.get("/low-stock", getLowStockItems);

// ==========================================
// DYNAMIC MATERIAL ID ROUTES
// IMPORTANT: KEEP THESE AT THE END
// ==========================================

// Get material details
router.get("/:id", getSingleInventoryItem);

// Update material metadata
router.put("/:id", updateInventoryItem);

// Soft-delete inventory material
router.delete("/:id", deleteInventoryItem);

module.exports = router;
