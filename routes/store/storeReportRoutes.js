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

router.use(protect);
router.use(roleMiddleware("STORE_MANAGER"));

// REPORT DASHBOARD
router.get("/summary", getDailySummary);

// STOCK MOVEMENT REGISTER
router.get("/transactions", getStockTransactions);

// GOODS RECEIPT REGISTER
router.get("/inward", getStockInwardReport);

// MATERIAL ISSUE REGISTER
router.get("/issues", getMaterialIssueReport);

// TECHNICIAN RECEIVING REGISTER
router.get("/receiving", getTechnicianReceivingReport);

// DAMAGED / RETRIEVED MATERIAL REGISTER
router.get("/retrieved", getRetrievedMaterialsReport);

// SINGLE DOCUMENT DETAILS FOR RECEIPT PRINTING
router.get("/receipt/:type/:id", getReceiptDetails);

module.exports = router;
