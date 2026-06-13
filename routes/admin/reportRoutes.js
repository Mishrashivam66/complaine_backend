const express = require("express");

const router = express.Router();

const {
  getReports,
  exportExcelReport,
  exportPDFReport,
} = require("../../controllers/admin/reportController");

const { protect } = require("../../middleware/authMiddleware");

// ======================================
// REPORTS
// ======================================

router.get("/all", protect, getReports);
// ======================================
// EXPORT EXCEL
// ======================================

router.get("/export/excel", protect, exportExcelReport);

// ======================================
// EXPORT PDF
// ======================================

router.get("/export/pdf", protect, exportPDFReport);

module.exports = router;
