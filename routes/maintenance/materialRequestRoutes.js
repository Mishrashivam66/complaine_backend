"use strict";

const express = require("express");
const router = express.Router();

const {
  getAllMaterialRequests,
  getMyMaterialRequests,
  getComplaintMaterialRequests,
  createMaterialRequest,
  deleteMaterialRequest,
} = require("../../controllers/maintenance/materialRequestController");

const { protect } = require("../../middleware/authMiddleware");
const roleMiddleware = require("../../middleware/roleMiddleware");

// ======================================================
// AMI MAINTENANCE — MATERIAL REQUEST ROUTES
// ======================================================

const managerAccess = [protect, roleMiddleware("MAINTENANCE_MANAGER")];

const technicianAccess = [protect, roleMiddleware("TECHNICIAN")];

const managerAndStoreAccess = [
  protect,
  roleMiddleware("MAINTENANCE_MANAGER", "STORE_MANAGER"),
];

const requesterAccess = [
  protect,
  roleMiddleware("MAINTENANCE_MANAGER", "TECHNICIAN"),
];

// ------------------------------------------------------
// Existing GET ALL — Manager and Store Manager
// ------------------------------------------------------

router.get("/", ...managerAndStoreAccess, getAllMaterialRequests);

// ------------------------------------------------------
// NEW — Technician's assigned complaint requests
// ------------------------------------------------------

router.get("/my-requests", ...technicianAccess, getMyMaterialRequests);

// ------------------------------------------------------
// NEW — Complaint-wise history for Manager / Technician
// ------------------------------------------------------

router.get(
  "/complaint/:complaintId",
  ...requesterAccess,
  getComplaintMaterialRequests,
);

// ------------------------------------------------------
// CREATE — Manager or assigned Technician
// Controller applies stricter ownership checks.
// ------------------------------------------------------

router.post("/create", ...requesterAccess, createMaterialRequest);

// ------------------------------------------------------
// DELETE — Maintenance Manager only
// ------------------------------------------------------

router.delete("/:id", ...managerAccess, deleteMaterialRequest);

module.exports = router;
