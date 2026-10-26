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
} = require("../../controllers/maintenance/workerController");

const {
  getMyJobs,
} = require("../../controllers/maintenance/technicianSelfController");

const { protect } = require("../../middleware/authMiddleware");

const roleMiddleware = require("../../middleware/roleMiddleware");

// ==========================================
// AUTHORIZATION
// ==========================================

const managerAccess = [protect, roleMiddleware("MAINTENANCE_MANAGER")];

const technicianAccess = [protect, roleMiddleware("TECHNICIAN")];

// ==========================================
// TECHNICIAN SELF-SERVICE
// ==========================================

router.get("/my-jobs", ...technicianAccess, getMyJobs);

// ==========================================
// MANAGER: ALL COMPLAINTS
// ==========================================

router.get("/complaints", ...managerAccess, getComplaintsForAssignment);

// ==========================================
// MANAGER: TECHNICIAN DIRECTORY
// ==========================================

router.get("/workers", ...managerAccess, getWorkers);

// ==========================================
// MANAGER: ASSIGN TECHNICIAN
// ==========================================

router.put("/assign-worker", ...managerAccess, assignWorker);

// ==========================================
// MANAGER: CREATE ACCOUNT
// ==========================================

router.post("/create-worker", ...managerAccess, createWorker);

// ==========================================
// MANAGER: ACTIVATE LEGACY LOGIN
// ==========================================

router.put(
  "/activate-login/:id",
  ...managerAccess,
  activateLegacyTechnicianLogin,
);

// ==========================================
// MANAGER: STATUS
// ==========================================

router.put("/update-status/:id", ...managerAccess, updateWorkerStatus);

// ==========================================
// MANAGER: EDIT
// ==========================================

router.put("/update-worker/:id", ...managerAccess, updateWorker);

// ==========================================
// MANAGER: ARCHIVE
// ==========================================

router.delete("/delete-worker/:id", ...managerAccess, deleteWorker);

module.exports = router;
