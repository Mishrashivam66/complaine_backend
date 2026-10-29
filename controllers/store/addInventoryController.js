"use strict";

// ==========================================
// AMI MAINTENANCE
// LEGACY INVENTORY CONTROLLER COMPATIBILITY
// ==========================================
//
// Existing endpoints and controller exports
// are preserved.
//
// Inventory operations are handled by the
// central inventoryController to avoid
// inconsistent stock and item-code behavior.
//
// ==========================================

const inventoryController = require("./inventoryController");

// ==========================================
// ADD INVENTORY
// ==========================================

// Legacy direct stock creation is disabled.
// All new physical stock should arrive through
// Stock Inward (manual / Excel), where the
// transaction history and GRN can be recorded.

exports.addInventory = async (req, res) => {
  return res.status(409).json({
    success: false,
    message:
      "Direct inventory addition is disabled. Use Stock Inward (Manual Entry or Excel Import).",
  });
};

// ==========================================
// GET ALL INVENTORY
// ==========================================

exports.getAllInventory = inventoryController.getInventoryItems;

// ==========================================
// GET SINGLE INVENTORY
// ==========================================

// Preserve the old response key "inventory"
// for legacy consumers.

exports.getSingleInventory = async (req, res) => {
  return inventoryController.getSingleInventoryItem(req, res);
};

// ==========================================
// UPDATE INVENTORY
// ==========================================

// Only metadata and Item Code are editable.
// Stock quantities cannot be overwritten.

exports.updateInventory = inventoryController.updateInventoryItem;

// ==========================================
// DELETE INVENTORY
// ==========================================

// Soft deletion only. Existing stock records,
// vouchers and transaction references survive.

exports.deleteInventory = inventoryController.deleteInventoryItem;

// ==========================================
// LOW STOCK ITEMS
// ==========================================

exports.getLowStockItems = inventoryController.getLowStockItems;
