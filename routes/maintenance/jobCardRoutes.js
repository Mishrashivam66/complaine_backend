const express = require("express");

const router = express.Router();

// ==========================================
// IMPORT CONTROLLERS
// ==========================================

const {
  getAllJobCards,

  getSingleJobCard,

  updateJobStatus,

  deleteJobCard,
} = require("../../controllers/maintenance/jobCardController");

// ==========================================
// IMPORT MIDDLEWARE
// ==========================================

const { protect } = require("../../middleware/authMiddleware");

const roleMiddleware = require("../../middleware/roleMiddleware");

// ==========================================
// GET ALL JOB CARDS
// MAINTENANCE MANAGER -> ALL JOBS
// WORKER -> ONLY OWN JOBS
// ==========================================

router.get(
  "/",

  protect,

  roleMiddleware("MAINTENANCE_MANAGER", "WORKER"),

  getAllJobCards,
);

// ==========================================
// GET SINGLE JOB CARD
// ==========================================

router.get(
  "/:id",

  protect,

  roleMiddleware("MAINTENANCE_MANAGER", "WORKER"),

  getSingleJobCard,
);

// ==========================================
// UPDATE JOB STATUS
// ==========================================

router.put(
  "/update-status/:id",

  protect,

  roleMiddleware("MAINTENANCE_MANAGER", "WORKER"),

  updateJobStatus,
);

// ==========================================
// DELETE JOB CARD
// ONLY MAINTENANCE MANAGER
// ==========================================

router.delete(
  "/:id",

  protect,

  roleMiddleware("MAINTENANCE_MANAGER"),

  deleteJobCard,
);

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;
