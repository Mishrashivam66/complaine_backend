"use strict";

const express = require("express");

const router = express.Router();

const {
  createJobCard,
  getAllJobCards,
  getSingleJobCard,
  updateJobStatus,
  deleteJobCard,
  markJobCardPrinted,
  completeSelectedComplaints,
} = require("../../controllers/maintenance/jobCardController");

const { protect } = require("../../middleware/authMiddleware");

const roleMiddleware = require("../../middleware/roleMiddleware");

// ==========================================
// CREATE JOB CARD
// ==========================================

router.post(
  "/create",
  protect,
  roleMiddleware("MAINTENANCE_MANAGER"),
  createJobCard,
);

// ==========================================
// GET ALL JOB CARDS
// ==========================================

router.get(
  "/",
  protect,
  roleMiddleware("MAINTENANCE_MANAGER", "WORKER", "TECHNICIAN"),
  getAllJobCards,
);

// ==========================================
// GET SINGLE JOB CARD
// ==========================================

router.get(
  "/:id",
  protect,
  roleMiddleware("MAINTENANCE_MANAGER", "WORKER", "TECHNICIAN"),
  getSingleJobCard,
);

// ==========================================
// UPDATE JOB STATUS
// ==========================================

router.put(
  "/update-status/:id",
  protect,
  roleMiddleware("MAINTENANCE_MANAGER", "WORKER", "TECHNICIAN"),
  updateJobStatus,
);

// ==========================================
// ARCHIVE / DELETE JOB CARD
// ==========================================

router.delete(
  "/:id",
  protect,
  roleMiddleware("MAINTENANCE_MANAGER"),
  deleteJobCard,
);

// ==========================================
// COMPLETE SELECTED COMPLAINTS
// ==========================================

router.put(
  "/:id/complete-complaints",
  protect,
  roleMiddleware("MAINTENANCE_MANAGER"),
  completeSelectedComplaints,
);

// ==========================================
// MARK PRINTED
// ==========================================

router.put(
  "/:id/mark-printed",
  protect,
  roleMiddleware("MAINTENANCE_MANAGER"),
  markJobCardPrinted,
);

module.exports = router;
