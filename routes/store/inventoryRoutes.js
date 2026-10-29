const express = require("express");
const router = express.Router();

const { protect } = require("../../middleware/authMiddleware");
const roleMiddleware = require("../../middleware/roleMiddleware");

// Existing create functionality
const {
  addInventory,
} = require("../../controllers/store/addInventoryController");

// Updated inventory controller
const {
  getInventoryItems,
  getSingleInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getLowStockItems,
} = require("../../controllers/store/inventoryController");

// Authentication
router.use(protect);
router.use(roleMiddleware("STORE_MANAGER"));

// Inventory list
router.get("/all", getInventoryItems);

// Low stock
router.get("/low-stock", getLowStockItems);

// Add inventory - existing endpoint retained
router.post("/add", addInventory);

// Single inventory
router.get("/:id", getSingleInventoryItem);

// Update metadata, including missing Item Code
router.put("/:id", updateInventoryItem);

// Soft delete
router.delete("/:id", deleteInventoryItem);

module.exports = router;
