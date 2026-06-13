const express = require("express");

const router = express.Router();

// ==========================================
// IMPORT CONTROLLER
// ==========================================

const {
  getReports,
} = require("../../controllers/maintenance/reportController");

// ==========================================
// IMPORT MIDDLEWARE
// ==========================================

const { protect } = require("../../middleware/authMiddleware");

const roleMiddleware = require("../../middleware/roleMiddleware");

// ==========================================
// GET REPORTS
// ==========================================

router.get(
  "/",

  protect,

  roleMiddleware("MAINTENANCE_MANAGER"),

  getReports,
);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
