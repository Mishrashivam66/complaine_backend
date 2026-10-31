"use strict";

// ==========================================
// AMI MAINT.
// STORE MANAGER - STOCK CONTROLLER
// ==========================================

// Reuse the existing inventory controller
// to keep stock and inventory routes compatible.

const {
  createInventoryItem,
  getInventoryItems,
  getSingleInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  updateStock,
  getLowStockItems,
} = require("./inventoryController");

// ==========================================
// EXPORT ALL STOCK CONTROLLER FUNCTIONS
// ==========================================

module.exports = {
  createInventoryItem,
  getInventoryItems,
  getSingleInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  updateStock,
  getLowStockItems,
};
