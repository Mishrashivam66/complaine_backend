const express = require("express");

const router = express.Router();

const {
  getLandingStats,
} = require("../../controllers/public/landingController");

// ==========================================
// LANDING PAGE STATISTICS
// NO LOGIN REQUIRED
// ==========================================

router.get("/landing-stats", getLandingStats);

module.exports = router;
