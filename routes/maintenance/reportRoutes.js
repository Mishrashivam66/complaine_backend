"use strict";

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

// All report endpoints require Maintenance Manager login.

router.use(protect);
router.use(roleMiddleware("MAINTENANCE_MANAGER"));

// Dashboard report and analytics
router.get("/", getReports);

// Professional PDF report
router.get("/export/pdf", exportPDFReport);

// Detailed Excel workbook
router.get("/export/excel", exportExcelReport);

// CSV report
router.get("/export/csv", exportCSVReport);

module.exports = router;
