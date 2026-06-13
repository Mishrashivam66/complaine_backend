const express = require("express");

const router = express.Router();

// ==========================================
// IMPORT CONTROLLER
// ==========================================

const {
  getAllReopenComplaints,

  createReopenComplaint,

  reassignWorker,
} = require("../../controllers/maintenance/reopenComplaintController");

// ==========================================
// IMPORT MIDDLEWARE
// ==========================================

const { protect } = require("../../middleware/authMiddleware");

const roleMiddleware = require("../../middleware/roleMiddleware");

// ==========================================
// GET ALL REOPEN COMPLAINTS
// ==========================================

router.get(
  "/",

  protect,

  roleMiddleware("MAINTENANCE_MANAGER"),

  getAllReopenComplaints,
);

// ==========================================
// CREATE REOPEN COMPLAINT
// ==========================================

router.post(
  "/create",

  protect,

  roleMiddleware("MAINTENANCE_MANAGER", "STUDENT"),

  createReopenComplaint,
);

// ==========================================
// REASSIGN WORKER
// ==========================================

router.put(
  "/reassign/:id",

  protect,

  roleMiddleware("MAINTENANCE_MANAGER"),

  reassignWorker,
);

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;
