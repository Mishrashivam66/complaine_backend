const express = require("express");
const router = express.Router();

const { protect } = require("../../middleware/authMiddleware");
const roleMiddleware = require("../../middleware/roleMiddleware");

// Use the controller that exports these exact functions.
const {
  createInventoryItem,
  getInventoryItems,
  getSingleInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  updateStock,
  getLowStockItems,
} = require("../../controllers/store/inventoryController");

// ==========================================
// AUTHENTICATION
// ==========================================

router.use(protect);
router.use(roleMiddleware("STORE_MANAGER"));

// ==========================================
// INVENTORY ROUTES
// ==========================================

router.post("/create", createInventoryItem);

router.get("/all", getInventoryItems);

router.get("/low-stock", getLowStockItems);

router.get("/:id", getSingleInventoryItem);

router.put("/:id", updateInventoryItem);

router.put("/update-stock/:id", updateStock);

router.delete("/:id", deleteInventoryItem);

module.exports = router;
