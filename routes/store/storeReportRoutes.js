const express = require("express");
const router = express.Router();

const { protect } = require("../../middleware/authMiddleware");

const roleMiddleware = require("../../middleware/roleMiddleware");

const {
  getDailySummary,
  getStockTransactions,
  getStockInwardReport,
  getMaterialIssueReport,
  getTechnicianReceivingReport,
  getRetrievedMaterialsReport,
  getReceiptDetails,
} = require("../../controllers/store/storeReportController");

const {
  getDailyReport,
  exportDailyReport,
} = require("../../controllers/store/dailyStoreReportController");

const {
  getReportCategories,
  getUnifiedPreview,
  exportUnifiedReport,
} = require("../../controllers/store/unifiedStoreReportController");

// Authentication and authorization
router.use(protect);
router.use(roleMiddleware("STORE_MANAGER"));

// Existing complete daily report
router.get("/daily", getDailyReport);
router.get("/daily/export", exportDailyReport);

// NEW: unified report system
router.get("/unified/categories", getReportCategories);
router.get("/unified/preview", getUnifiedPreview);
router.get("/unified/export", exportUnifiedReport);

// Existing store reports
router.get("/summary", getDailySummary);
router.get("/transactions", getStockTransactions);
router.get("/inward", getStockInwardReport);
router.get("/issues", getMaterialIssueReport);
router.get("/receiving", getTechnicianReceivingReport);
router.get("/retrieved", getRetrievedMaterialsReport);

// Existing individual receipts
router.get("/receipt/:type/:id", getReceiptDetails);

module.exports = router;
