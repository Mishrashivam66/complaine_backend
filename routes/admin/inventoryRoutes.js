const express = require("express");

const router = express.Router();

const {
  getInventory,

  addInventory,

  deleteInventory,
} = require("../../controllers/admin/inventoryController");

// ======================================
// GET ALL INVENTORY
// ======================================

router.get("/all", getInventory);

// ======================================
// ADD INVENTORY
// ======================================

router.post("/add", addInventory);

// ======================================
// DELETE INVENTORY
// ======================================

router.delete("/delete/:id", deleteInventory);

module.exports = router;
