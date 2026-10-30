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
const stockInwardRoutes = require("./stockInwardRoutes");

// REPORTS
const storeReportRoutes = require("./storeReportRoutes");

// MATERIAL RECEIVING CONTROLLER
const materialReceivingController = require("../../controllers/store/materialReceivingController");

// ==========================================
// AUTHENTICATION
// ==========================================

router.use(protect);

// ==========================================
// STORE MANAGER DASHBOARD
// ==========================================

router.use("/dashboard", roleMiddleware("STORE_MANAGER"), dashboardRoutes);

// ==========================================
// INVENTORY
// ==========================================

router.use("/inventory", roleMiddleware("STORE_MANAGER"), inventoryRoutes);

router.use(
  "/add-inventory",
  roleMiddleware("STORE_MANAGER"),
  addInventoryRoutes,
);

// ==========================================
// STOCK MANAGEMENT
// ==========================================

router.use("/stock", roleMiddleware("STORE_MANAGER"), stockRoutes);

router.use("/low-stock", roleMiddleware("STORE_MANAGER"), lowStockRoutes);

router.use("/stock-inward", roleMiddleware("STORE_MANAGER"), stockInwardRoutes);

// ==========================================
// MATERIAL REQUESTS
// Preserve existing request route permissions
// ==========================================

router.use("/requests", requestRoutes);

// ==========================================
// ISSUED ITEMS
// ==========================================

router.use("/issued-items", roleMiddleware("STORE_MANAGER"), issuedItemRoutes);

// ==========================================
// RETRIEVED MATERIAL
// ==========================================

router.use(
  "/retrieved-items",
  roleMiddleware("STORE_MANAGER"),
  retrievedItemRoutes,
);

// ==========================================
// DAMAGED MATERIAL
// ==========================================

router.use(
  "/damaged-items",
  roleMiddleware("STORE_MANAGER"),
  damagedItemRoutes,
);

// ==========================================
// TECHNICIAN MATERIAL RECEIVING
// FIX: WORKER -> TECHNICIAN
// ==========================================

// Technician views materials issued to them
router.get(
  "/material-receiving/my-materials",
  roleMiddleware("TECHNICIAN"),
  materialReceivingController.getMyMaterials,
);

// Technician confirms actual received quantity
router.post(
  "/material-receiving/confirm",
  roleMiddleware("TECHNICIAN"),
  materialReceivingController.confirmReceiving,
);

// ==========================================
// STORE MANAGER RECEIVING AUDIT
// ==========================================

router.get(
  "/material-receiving/all",
  roleMiddleware("STORE_MANAGER"),
  materialReceivingController.getAllReceiving,
);

// ==========================================
// REPORTS & RECEIPTS
// ==========================================

router.use("/reports", roleMiddleware("STORE_MANAGER"), storeReportRoutes);

module.exports = router;
