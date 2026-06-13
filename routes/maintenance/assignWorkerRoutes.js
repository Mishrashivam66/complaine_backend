const express = require("express");

const router = express.Router();

// ==========================================
// IMPORT CONTROLLER
// ==========================================

const {
  getComplaintsForAssignment,

  getWorkers,

  assignWorker,
} = require("../../controllers/maintenance/assignWorkerController");

// ==========================================
// IMPORT MIDDLEWARE
// ==========================================

const { protect } = require("../../middleware/authMiddleware");

const roleMiddleware = require("../../middleware/roleMiddleware");

// ==========================================
// MANAGER ACCESS
// ==========================================

const managerAccess = [protect, roleMiddleware("MAINTENANCE_MANAGER")];

// ==========================================
// GET ALL COMPLAINTS
// API:
// GET
// /api/maintenance/assign-worker/complaints
// ==========================================

router.get(
  "/complaints",

  ...managerAccess,

  getComplaintsForAssignment,
);

// ==========================================
// GET ALL WORKERS
// API:
// GET
// /api/maintenance/assign-worker/workers
// ==========================================

router.get(
  "/workers",

  ...managerAccess,

  getWorkers,
);

// ==========================================
// ASSIGN WORKER
// API:
// PUT
// /api/maintenance/assign-worker/assign
// ==========================================

router.put(
  "/assign",

  ...managerAccess,

  assignWorker,
);

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;
