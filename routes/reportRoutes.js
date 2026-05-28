const express = require("express");

const {
  getDashboardReport,
  exportComplaints,
} = require("../controllers/reportController");

const router = express.Router();

router.get(
  "/dashboard",
  getDashboardReport
);

router.get(
  "/export-complaints",
  exportComplaints
);

module.exports = router;