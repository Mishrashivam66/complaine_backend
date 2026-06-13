const express = require("express");

const router = express.Router();

// ==========================================
// IMPORT CONTROLLERS
// ==========================================

const {
  addInventory,

  getAllInventory,

  getSingleInventory,

  updateInventory,

  deleteInventory,

  getLowStockItems,
} = require("../../controllers/store/addInventoryController");

// ==========================================
// ADD INVENTORY
// ==========================================

router.post("/add", addInventory);

// ==========================================
// GET ALL INVENTORY
// ==========================================

router.get("/all", getAllInventory);

// ==========================================
// LOW STOCK ITEMS
// ==========================================

router.get("/low-stock", getLowStockItems);

// ==========================================
// GET SINGLE INVENTORY
// ==========================================

router.get("/:id", getSingleInventory);

// ==========================================
// UPDATE INVENTORY
// ==========================================

router.put("/update/:id", updateInventory);

// ==========================================
// DELETE INVENTORY
// ==========================================

router.delete("/delete/:id", deleteInventory);

// ==========================================

module.exports = router;
