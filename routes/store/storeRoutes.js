const express = require("express");
const router = express.Router();

const { protect } = require("../../middleware/authMiddleware");
const roleMiddleware = require("../../middleware/roleMiddleware");

// ==========================================
// EXISTING STORE ROUTES
// ==========================================

const dashboardRoutes = require("./dashboardRoutes");
const inventoryRoutes = require("./inventoryRoutes");
const addInventoryRoutes = require("./addInventoryRoutes");
const stockRoutes = require("./stockRoutes");
const lowStockRoutes = require("./lowStockRoutes");
const requestRoutes = require("./requestRoutes");
const issuedItemRoutes = require("./issuedItemRoutes");
const damagedItemRoutes = require("./damagedItemRoutes");
const retrievedItemRoutes = require("./retrievedItemRoutes");
const stockInwardRoutes = require("./stockInwardRoutes");

// ==========================================
// NEW MATERIAL RECEIVING CONTROLLER
// ==========================================

const materialReceivingController = require("../../controllers/store/materialReceivingController");

// ==========================================
// ALL ROUTES REQUIRE AUTHENTICATION
// ==========================================

router.use(protect);

// ==========================================
// STORE MANAGER DASHBOARD
// ==========================================

router.use("/dashboard", roleMiddleware("STORE_MANAGER"), dashboardRoutes);

// ==========================================
// INVENTORY MANAGEMENT
// ==========================================

router.use("/inventory", roleMiddleware("STORE_MANAGER"), inventoryRoutes);

router.use(
  "/add-inventory",
  roleMiddleware("STORE_MANAGER"),
  addInventoryRoutes,
);

// ==========================================
// STOCK OPERATIONS
// ==========================================

router.use("/stock", roleMiddleware("STORE_MANAGER"), stockRoutes);

router.use("/low-stock", roleMiddleware("STORE_MANAGER"), lowStockRoutes);

router.use("/stock-inward", roleMiddleware("STORE_MANAGER"), stockInwardRoutes);

// ==========================================
// MATERIAL REQUESTS
// ==========================================

// Store Manager reviews/approves requests.
// Request creation by Manager/Technician can use
// its existing separately authorized routes.
router.use("/requests", requestRoutes);

// ==========================================
// MATERIAL ISSUE
// ==========================================

router.use("/issued-items", roleMiddleware("STORE_MANAGER"), issuedItemRoutes);

// ==========================================
// RETRIEVED MATERIALS
// ==========================================

router.use(
  "/retrieved-items",
  roleMiddleware("STORE_MANAGER"),
  retrievedItemRoutes,
);

// ==========================================
// LEGACY DAMAGED ITEMS
// ==========================================

router.use(
  "/damaged-items",
  roleMiddleware("STORE_MANAGER"),
  damagedItemRoutes,
);

// ==========================================
// TECHNICIAN MATERIAL RECEIVING
// ==========================================

// Only the authenticated Technician can view
// materials assigned to their account.

router.get(
  "/material-receiving/my-materials",
  roleMiddleware("WORKER"),
  materialReceivingController.getMyMaterials,
);

// Technician confirms physically received quantity.

router.post(
  "/material-receiving/confirm",
  roleMiddleware("WORKER"),
  materialReceivingController.confirmReceiving,
);

// ==========================================
// STORE MANAGER RECEIVING AUDIT
// ==========================================

// Store Manager can view confirmations,
// differences and disputed quantities.

router.get(
  "/material-receiving/all",
  roleMiddleware("STORE_MANAGER"),
  materialReceivingController.getAllReceiving,
);

module.exports = router;
