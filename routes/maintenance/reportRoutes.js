const express = require("express");

const router = express.Router();

const {
  getReports,
  exportPDFReport,
  exportExcelReport,
  exportCSVReport,
} = require("../../controllers/maintenance/reportController");

const { protect } = require("../../middleware/authMiddleware");

const roleMiddleware = require("../../middleware/roleMiddleware");

router.get("/", protect, roleMiddleware("MAINTENANCE_MANAGER"), getReports);

router.get(
  "/export/pdf",
  protect,
  roleMiddleware("MAINTENANCE_MANAGER"),
  exportPDFReport,
);

router.get(
  "/export/excel",
  protect,
  roleMiddleware("MAINTENANCE_MANAGER"),
  exportExcelReport,
);

router.get(
  "/export/csv",
  protect,
  roleMiddleware("MAINTENANCE_MANAGER"),
  exportCSVReport,
);

module.exports = router;
