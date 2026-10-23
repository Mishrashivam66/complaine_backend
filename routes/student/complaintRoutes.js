"use strict";

const express = require("express");
const router = express.Router();

const {
  createComplaint,
  getAllComplaints,
  getMyComplaints,
  getComplaintById,
  updateComplaintStatus,
  assignComplaint,
  reopenComplaint,
} = require("../../controllers/student/complaintController");

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

// ==========================================
// COMPLAINT BLOCKING MIDDLEWARE
// ==========================================

const requireStudentComplaintAccess = require("../../middleware/requireStudentComplaintAccess");

// ==========================================
// CREATE COMPLAINT
// ==========================================

router.post(
  "/create",
  protect,
  authorizeRoles("STUDENT"),
  requireStudentComplaintAccess,
  createComplaint,
);

// ==========================================
// GET MY COMPLAINTS
// ==========================================

router.get("/my-complaints", protect, getMyComplaints);

// ==========================================
// GET SINGLE
// ==========================================

router.get("/:id", protect, getComplaintById);

// ==========================================
// GET ALL
// ==========================================

router.get(
  "/",
  protect,
  authorizeRoles("ADMIN", "WARDEN", "MAINTENANCE_MANAGER"),
  getAllComplaints,
);

// ==========================================
// UPDATE STATUS
// ==========================================

router.put(
  "/update-status/:id",
  protect,
  authorizeRoles("ADMIN", "WORKER", "WARDEN"),
  updateComplaintStatus,
);

// ==========================================
// ASSIGN COMPLAINT
// ==========================================

router.put(
  "/assign/:id",
  protect,
  authorizeRoles("ADMIN", "MAINTENANCE_MANAGER"),
  assignComplaint,
);

// ==========================================
// REOPEN COMPLAINT
// ==========================================

router.put("/reopen/:id", protect, reopenComplaint);

// ==========================================
// TEST
// ==========================================

router.get("/test/api", (req, res) => {
  res.json({
    success: true,
    message: "Complaint Routes Working",
  });
});

module.exports = router;
