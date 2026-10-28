const express = require("express");
const router = express.Router();

const { protect } = require("../../middleware/authMiddleware");
const roleMiddleware = require("../../middleware/roleMiddleware");

const dashboardRoutes = require("./dashboardRoutes");
const inventoryRoutes = require("./inventoryRoutes");
const addInventoryRoutes = require("./addInventoryRoutes");
const stockRoutes = require("./stockRoutes");
const lowStockRoutes = require("./lowStockRoutes");
const requestRoutes = require("./requestRoutes");
const issuedItemRoutes = require("./issuedItemRoutes");
const damagedItemRoutes = require("./damagedItemRoutes");
const retrievedItemRoutes = require("./retrievedItemRoutes");
// NEW: Stock Inward & Excel Import
const stockInwardRoutes = require("./stockInwardRoutes");

// Authentication
router.use(protect);

// ==========================================
// DASHBOARD
// ==========================================

router.use("/dashboard", roleMiddleware("STORE_MANAGER"), dashboardRoutes);

// ==========================================
// INVENTORY
// ==========================================

router.use("/inventory", roleMiddleware("STORE_MANAGER"), inventoryRoutes);
// must cover this route as well.
router.use("/retrieved-items", retrievedItemRoutes);

router.use(
  "/add-inventory",
  roleMiddleware("STORE_MANAGER"),
  addInventoryRoutes,
);

// ==========================================
// STOCK
// ==========================================

router.use("/stock", roleMiddleware("STORE_MANAGER"), stockRoutes);

router.use("/low-stock", roleMiddleware("STORE_MANAGER"), lowStockRoutes);

// ==========================================
// NEW: STOCK INWARD
// ==========================================

router.use("/stock-inward", roleMiddleware("STORE_MANAGER"), stockInwardRoutes);

// ==========================================
// MATERIAL REQUESTS
// ==========================================

router.use("/requests", requestRoutes);

// ==========================================
// MATERIAL ISSUE
// ==========================================

router.use("/issued-items", issuedItemRoutes);

// ==========================================
// RETRIEVED ITEMS (LEGACY ROUTE)
// ==========================================

router.use(
  "/damaged-items",
  roleMiddleware("STORE_MANAGER"),
  damagedItemRoutes,
);

module.exports = router;
