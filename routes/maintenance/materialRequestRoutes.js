"use strict";

const express = require("express");
const router = express.Router();

const {
  getAllMaterialRequests,
  getMyMaterialRequests,
  getComplaintMaterialRequests,
  createMaterialRequest,
  deleteMaterialRequest,
  approveTechnicianMaterialRequest,
  rejectTechnicianMaterialRequest,
} = require("../../controllers/maintenance/materialRequestController");

const { protect } = require("../../middleware/authMiddleware");
const roleMiddleware = require("../../middleware/roleMiddleware");

// ==========================================
// ROLE ACCESS
// ==========================================

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

// ==========================================
// EXISTING ROUTES
// ==========================================

// Manager and Store Manager
router.get("/", ...managerAndStoreAccess, getAllMaterialRequests);

// Technician requests
router.get("/my-requests", ...technicianAccess, getMyMaterialRequests);

// Complaint-wise requests
router.get(
  "/complaint/:complaintId",
  ...requesterAccess,
  getComplaintMaterialRequests,
);

// Create material request
router.post("/create", ...requesterAccess, createMaterialRequest);

// Delete pending material request
router.delete("/:id", ...managerAccess, deleteMaterialRequest);

router.put(
  "/:id/manager-approve",
  ...managerAccess,
  approveTechnicianMaterialRequest,
);

router.put(
  "/:id/manager-reject",
  ...managerAccess,
  rejectTechnicianMaterialRequest,
);

module.exports = router;
