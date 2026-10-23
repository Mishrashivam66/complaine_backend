"use strict";

const express = require("express");
const router = express.Router();

const {
  createComplaint,
  getHostelComplaints,
  getSingleComplaint,
  updateComplaintStatus,
  assignWorker,
  escalateComplaint,
  deleteComplaint,
} = require("../../controllers/warden/complaintController");

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

const requireStudentComplaintAccess = require("../../middleware/requireStudentComplaintAccess");

// ==========================================
// LEGACY STUDENT COMPLAINT CREATE
// ==========================================

router.post(
  "/create",
  protect,
  authorizeRoles("STUDENT"),
  requireStudentComplaintAccess,
  createComplaint,
);

// ==========================================
// WARDEN COMPLAINTS
// ==========================================

router.get("/", protect, authorizeRoles("WARDEN"), getHostelComplaints);

router.get("/:id", protect, getSingleComplaint);

router.put(
  "/:id/status",
  protect,
  authorizeRoles("WARDEN"),
  updateComplaintStatus,
);

router.put("/:id/assign", protect, authorizeRoles("WARDEN"), assignWorker);

router.put(
  "/:id/escalate",
  protect,
  authorizeRoles("WARDEN"),
  escalateComplaint,
);

router.delete(
  "/:id",
  protect,
  authorizeRoles("ADMIN", "WARDEN"),
  deleteComplaint,
);

module.exports = router;
