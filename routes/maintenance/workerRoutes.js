"use strict";

const express = require("express");
const router = express.Router();

const {
  getComplaintsForAssignment,
  getWorkers,
  assignWorker,
  createWorker,
  activateLegacyTechnicianLogin,
  deleteWorker,
  updateWorkerStatus,
  updateWorker,
  startMyWork,
} = require("../../controllers/maintenance/workerController");

const {
  getMyJobs,
} = require("../../controllers/maintenance/technicianSelfController");

const {
  startRework,
  markWorkDone,
} = require("../../controllers/maintenance/technicianActionController");

const { protect } = require("../../middleware/authMiddleware");

const roleMiddleware = require("../../middleware/roleMiddleware");

const managerAccess = [protect, roleMiddleware("MAINTENANCE_MANAGER")];

const technicianAccess = [protect, roleMiddleware("TECHNICIAN")];

// ======================================================
// TECHNICIAN — OWN ASSIGNED COMPLAINTS
// ======================================================

router.get("/my-jobs", ...technicianAccess, getMyJobs);

// Start initially assigned work
router.put("/my-jobs/:complaintId/start", ...technicianAccess, startMyWork);

// Start rework on a reopened complaint
router.put(
  "/my-jobs/:complaintId/start-rework",
  ...technicianAccess,
  startRework,
);

// Technician completes physical repair
// Student YES/NO confirmation remains separate.
router.put(
  "/my-jobs/:complaintId/work-done",
  ...technicianAccess,
  markWorkDone,
);

// ======================================================
// MAINTENANCE MANAGER ROUTES
// ======================================================

router.get("/complaints", ...managerAccess, getComplaintsForAssignment);

router.get("/workers", ...managerAccess, getWorkers);

router.put("/assign-worker", ...managerAccess, assignWorker);

router.post("/create-worker", ...managerAccess, createWorker);

router.put(
  "/activate-login/:id",
  ...managerAccess,
  activateLegacyTechnicianLogin,
);

router.put("/update-status/:id", ...managerAccess, updateWorkerStatus);

router.put("/update-worker/:id", ...managerAccess, updateWorker);

router.delete("/delete-worker/:id", ...managerAccess, deleteWorker);

module.exports = router;
