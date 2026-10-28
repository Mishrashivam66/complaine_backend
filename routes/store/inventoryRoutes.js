const express = require("express");
const router = express.Router();

const { protect } = require("../../middleware/authMiddleware");
const roleMiddleware = require("../../middleware/roleMiddleware");

const {
  addInventory,
  getAllInventory,
  getSingleInventory,
  updateInventory,
  deleteInventory,
  getLowStockItems,
} = require("../../controllers/store/addInventoryController");

router.use(protect);
router.use(roleMiddleware("STORE_MANAGER"));

router.get("/all", getAllInventory);
router.get("/low-stock", getLowStockItems);
router.get("/:id", getSingleInventory);

router.post("/add", addInventory);
router.put("/:id", updateInventory);
router.delete("/:id", deleteInventory);

module.exports = router;
