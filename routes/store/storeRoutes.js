const express = require("express");

const router = express.Router();

const inventoryRoutes = require("./inventoryRoutes");

const requestRoutes = require("./requestRoutes");

const issuedItemRoutes = require("./issuedItemRoutes");

const damagedItemRoutes = require("./damagedItemRoutes");

const dashboardRoutes = require("./dashboardRoutes");

// ==========================================
// ROUTES
// ==========================================

router.use("/issued-items", issuedItemRoutes);

router.use("/inventory", inventoryRoutes);

router.use("/requests", requestRoutes);

router.use("/damaged-items", damagedItemRoutes);

router.use("/dashboard", dashboardRoutes);

module.exports = router;
