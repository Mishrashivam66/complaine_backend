const express = require("express");

const router = express.Router();

// ==========================================
// IMPORT CONTROLLER
// ==========================================

const {
  getWorkerPerformance,
} = require("../../controllers/maintenance/performanceController");

// ==========================================
// IMPORT MIDDLEWARE
// ==========================================

const { protect } = require("../../middleware/authMiddleware");

const roleMiddleware = require("../../middleware/roleMiddleware");

// ==========================================
// GET PERFORMANCE
// ==========================================

router.get(
  "/",

  protect,

  roleMiddleware("MAINTENANCE_MANAGER"),

  getWorkerPerformance,
);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
