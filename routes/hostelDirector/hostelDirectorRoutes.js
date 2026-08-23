const express = require("express");

const router = express.Router();

const wardenRoutes = require("./wardenRoutes");

// ==========================================
// WARDEN MANAGEMENT
// ==========================================

router.use("/wardens", wardenRoutes);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
