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

// NEW REPORTS
const storeReportRoutes = require("./storeReportRoutes");

const materialReceivingController = require("../../controllers/store/materialReceivingController");

router.use(protect);

// DASHBOARD
router.use("/dashboard", roleMiddleware("STORE_MANAGER"), dashboardRoutes);

// INVENTORY
router.use("/inventory", roleMiddleware("STORE_MANAGER"), inventoryRoutes);

router.use(
  "/add-inventory",
  roleMiddleware("STORE_MANAGER"),
  addInventoryRoutes,
);

// STOCK
router.use("/stock", roleMiddleware("STORE_MANAGER"), stockRoutes);

router.use("/low-stock", roleMiddleware("STORE_MANAGER"), lowStockRoutes);

router.use("/stock-inward", roleMiddleware("STORE_MANAGER"), stockInwardRoutes);

// REQUESTS
router.use("/requests", requestRoutes);

// ISSUED ITEMS
router.use("/issued-items", roleMiddleware("STORE_MANAGER"), issuedItemRoutes);

// RETRIEVED MATERIAL
router.use(
  "/retrieved-items",
  roleMiddleware("STORE_MANAGER"),
  retrievedItemRoutes,
);

// LEGACY DAMAGED ITEMS
router.use(
  "/damaged-items",
  roleMiddleware("STORE_MANAGER"),
  damagedItemRoutes,
);

// TECHNICIAN RECEIVING
router.get(
  "/material-receiving/my-materials",
  roleMiddleware("WORKER"),
  materialReceivingController.getMyMaterials,
);

router.post(
  "/material-receiving/confirm",
  roleMiddleware("WORKER"),
  materialReceivingController.confirmReceiving,
);

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
