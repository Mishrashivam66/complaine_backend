const express = require("express");

const router = express.Router();

const {
  getStoreDashboard,
} = require("../../controllers/store/dashboardController");

// ==========================================
// DASHBOARD
// ==========================================

router.get("/", getStoreDashboard);

module.exports = router;
