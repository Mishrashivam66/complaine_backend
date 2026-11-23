"use strict";

const express = require("express");
const router = express.Router();

const { protect } = require("../../middleware/authMiddleware");

const roleMiddleware = require("../../middleware/roleMiddleware");

const {
  addInventory,
  getInventoryCategories,
} = require("../../controllers/store/addInventoryController");

const {
  getInventoryItems,
  getSingleInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getLowStockItems,
} = require("../../controllers/store/inventoryController");

// STORE MANAGER ONLY
router.use(protect);
router.use(roleMiddleware("STORE_MANAGER"));

// CREATE MATERIAL MASTER
router.post("/add", addInventory);

// Optional alias for existing consumers
router.post("/create", addInventory);

// DYNAMIC CATEGORIES
router.get("/categories", getInventoryCategories);

// INVENTORY LIST
router.get("/all", getInventoryItems);

// LOW STOCK
router.get("/low-stock", getLowStockItems);

// SINGLE MATERIAL
router.get("/:id", getSingleInventoryItem);

// UPDATE MATERIAL METADATA
router.put("/:id", updateInventoryItem);

// SOFT DELETE
router.delete("/:id", deleteInventoryItem);

module.exports = router;
