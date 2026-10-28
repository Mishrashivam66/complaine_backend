const express = require("express");
const router = express.Router();

const { protect } = require("../../middleware/authMiddleware");
const roleMiddleware = require("../../middleware/roleMiddleware");

const { getLowStockItems } = require("../../controllers/store/stockController");

router.get("/", protect, roleMiddleware("STORE_MANAGER"), getLowStockItems);

module.exports = router;
