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

const { protect } = require("../../middleware/authMiddleware");
const roleMiddleware = require("../../middleware/roleMiddleware");

const managerAccess = [protect, roleMiddleware("MAINTENANCE_MANAGER")];

const technicianAccess = [protect, roleMiddleware("TECHNICIAN")];

// ==========================================
// TECHNICIAN OWN JOB ROUTES
// ==========================================

router.get("/my-jobs", ...technicianAccess, getMyJobs);

router.put("/my-jobs/:complaintId/start", ...technicianAccess, startMyWork);

// ==========================================
// MAINTENANCE MANAGER ROUTES
// ==========================================

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
