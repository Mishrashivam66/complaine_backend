const express = require("express");

const router = express.Router();

// ==========================================
// CONTROLLER
// ==========================================

const {
  createReport,

  getReports,

  getSingleReport,

  deleteReport,
} = require("../../controllers/warden/reportController");

// ==========================================
// MIDDLEWARE
// ==========================================

const {
  protect,

  authorizeRoles,
} = require("../../middleware/authMiddleware");

// ==========================================
// WARDEN ONLY
// ==========================================

router.use(protect);

router.use(authorizeRoles("WARDEN"));

// ==========================================
// ROUTES
// ==========================================

// CREATE REPORT

router.post(
  "/create",

  createReport,
);

// GET ALL REPORTS

router.get(
  "/",

  getReports,
);

// GET SINGLE REPORT

router.get(
  "/:id",

  getSingleReport,
);

// DELETE REPORT

router.delete(
  "/:id",

  deleteReport,
);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
