const express = require("express");

const {
  createInventoryItem,
  getInventoryItems,
  updateStock,
} = require("../controllers/inventoryController");

const router = express.Router();

router.post("/", createInventoryItem);

router.get("/", getInventoryItems);

router.put("/:id", updateStock);

module.exports = router;