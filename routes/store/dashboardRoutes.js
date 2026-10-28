const express = require("express");
const router = express.Router();

const { protect } = require("../../middleware/authMiddleware");
const roleMiddleware = require("../../middleware/roleMiddleware");

const {
  getStoreDashboard,
} = require("../../controllers/store/dashboardController");

router.get("/", protect, roleMiddleware("STORE_MANAGER"), getStoreDashboard);

module.exports = router;
