const express = require("express");

const router = express.Router();

// ==========================================
// IMPORT CONTROLLERS
// ==========================================

const {
  createJobCard,
  getAllJobCards,
  getSingleJobCard,
  updateJobStatus,
  deleteJobCard,
  markJobCardPrinted,
} = require("../../controllers/maintenance/jobCardController");

// ==========================================
// IMPORT MIDDLEWARE
// ==========================================

const { protect } = require("../../middleware/authMiddleware");

const roleMiddleware = require("../../middleware/roleMiddleware");

// ==========================================
// CREATE JOB CARD
// ONLY MAINTENANCE MANAGER
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
// ==========================================

router.delete(
  "/:id",
  protect,
  roleMiddleware("MAINTENANCE_MANAGER"),
  deleteJobCard,
);

router.put("/:id/mark-printed", protect, markJobCardPrinted);
// ==========================================
// EXPORT
// ==========================================

module.exports = router;
