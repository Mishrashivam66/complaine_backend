const express = require("express");
const router = express.Router();

const { protect } = require("../../middleware/authMiddleware");
const roleMiddleware = require("../../middleware/roleMiddleware");

// ==========================================
// EXISTING REPORT CONTROLLER
// ==========================================

const {
  getDailySummary,
  getStockTransactions,
  getStockInwardReport,
  getMaterialIssueReport,
  getTechnicianReceivingReport,
  getRetrievedMaterialsReport,
  getReceiptDetails,
} = require("../../controllers/store/storeReportController");

// ==========================================
// NEW CONSOLIDATED DAILY CONTROLLER
// ==========================================

const {
  getDailyReport,
  exportDailyReport,
} = require("../../controllers/store/dailyStoreReportController");

// ==========================================
// AUTHENTICATION
// ==========================================

router.use(protect);
router.use(roleMiddleware("STORE_MANAGER"));

// ==========================================
// COMPLETE DAILY REPORT
// ==========================================

// JSON containing all daily records
router.get("/daily", getDailyReport);

// PDF and Excel downloads
router.get("/daily/export", exportDailyReport);

// ==========================================
// EXISTING REPORTS
// ==========================================

router.get("/summary", getDailySummary);

router.get("/transactions", getStockTransactions);

router.get("/inward", getStockInwardReport);

router.get("/issues", getMaterialIssueReport);

router.get("/receiving", getTechnicianReceivingReport);

router.get("/retrieved", getRetrievedMaterialsReport);

// ==========================================
// INDIVIDUAL RECEIPTS
// ==========================================

router.get("/receipt/:type/:id", getReceiptDetails);

module.exports = router;
