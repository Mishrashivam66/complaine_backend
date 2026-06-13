const express = require("express");

const router = express.Router();

// ==========================================
// IMPORT CONTROLLERS
// ==========================================

const {
  getComplaintsForAssignment,

  getWorkers,

  assignWorker,

  createWorker,

  deleteWorker,

  updateWorkerStatus,

  updateWorker,
} = require("../../controllers/maintenance/workerController");

// ==========================================
// IMPORT MIDDLEWARE
// ==========================================

const { protect } = require("../../middleware/authMiddleware");

const roleMiddleware = require("../../middleware/roleMiddleware");

// ==========================================
// MAINTENANCE MANAGER ACCESS
// ==========================================

const managerAccess = [protect, roleMiddleware("MAINTENANCE_MANAGER")];

// ==========================================
// GET ALL COMPLAINTS
// ==========================================
// API:
// GET
// /api/maintenance/worker/complaints
// ==========================================

router.get(
  "/complaints",

  ...managerAccess,

  getComplaintsForAssignment,
);

// ==========================================
// GET ALL WORKERS
// ==========================================
// API:
// GET
// /api/maintenance/worker/workers
// ==========================================

router.get(
  "/workers",

  ...managerAccess,

  getWorkers,
);

// ==========================================
// ASSIGN WORKER
// ==========================================
// API:
// PUT
// /api/maintenance/worker/assign-worker
// ==========================================

router.put(
  "/assign-worker",

  ...managerAccess,

  assignWorker,
);

// ==========================================
// CREATE WORKER
// ==========================================
// API:
// POST
// /api/maintenance/worker/create-worker
// ==========================================

router.post(
  "/create-worker",

  ...managerAccess,

  createWorker,
);

// ==========================================
// UPDATE WORKER STATUS
// ==========================================
// API:
// PUT
// /api/maintenance/worker/update-status/:id
// ==========================================

router.put(
  "/update-status/:id",

  ...managerAccess,

  updateWorkerStatus,
);

// ==========================================
// UPDATE WORKER
// ==========================================
// API:
// PUT
// /api/maintenance/worker/update-worker/:id
// ==========================================

router.put(
  "/update-worker/:id",

  ...managerAccess,

  updateWorker,
);

// ==========================================
// DELETE WORKER
// ==========================================
// API:
// DELETE
// /api/maintenance/worker/delete-worker/:id
// ==========================================

router.delete(
  "/delete-worker/:id",

  ...managerAccess,

  deleteWorker,
);

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;
