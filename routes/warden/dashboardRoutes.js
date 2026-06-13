const express = require("express");

const router = express.Router();

const {
  getDashboardData,
} = require("../../controllers/warden/dashboardController");

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

// ==========================================
// WARDEN ONLY
// ==========================================

router.use(protect);

router.use(authorizeRoles("WARDEN"));

// ==========================================
// DASHBOARD ROUTE
// ==========================================

router.get(
  "/",

  getDashboardData,
);

module.exports = router;
