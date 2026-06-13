const express = require("express");

const router = express.Router();

const {
  getMaintenanceDashboard,
} = require("../../controllers/maintenance/dashboardController");

const { protect } = require("../../middleware/authMiddleware");

const roleMiddleware = require("../../middleware/roleMiddleware");

// ==========================================
// DASHBOARD ROUTE
// ==========================================

router.get(
  "/",

  protect,

  roleMiddleware("MAINTENANCE_MANAGER"),

  getMaintenanceDashboard,
);

module.exports = router;
