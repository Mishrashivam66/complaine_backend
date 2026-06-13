const express = require("express");

const router = express.Router();

const {
  createInventoryItem,
  getInventoryItems,
  getSingleInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  updateStock,
  getLowStockItems,
} = require("../../controllers/store/inventoryController");

router.post("/add", createInventoryItem);

router.get("/all", getInventoryItems);

router.get("/low-stock", getLowStockItems);

router.put("/update/:id", updateInventoryItem);

router.delete("/delete/:id", deleteInventoryItem);

router.put("/stock/:id", updateStock);

router.get("/:id", getSingleInventoryItem);

module.exports = router;
