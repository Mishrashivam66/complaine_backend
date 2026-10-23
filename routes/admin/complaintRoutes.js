"use strict";

const express = require("express");
const router = express.Router();

const {
  createComplaint,
  getAllComplaints,
  getComplaintById,
  getMyComplaints,
  reopenComplaint,
  closeComplaint,
  assignComplaint,
  resolveComplaint,
  escalateComplaint,
  getComplaintStats,
} = require("../../controllers/admin/complaintController");

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

// ==========================================
// TEST
// ==========================================

router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Complaint route working",
  });
});

// ==========================================
// CREATE - ADMIN ONLY
// ==========================================

// Student must use /api/student/complaints/create.
// This prevents bypass through Admin's create API.

router.post("/create", protect, authorizeRoles("ADMIN"), createComplaint);

// ==========================================
// GET
// ==========================================

router.get("/all", protect, getAllComplaints);

router.get("/my", protect, getMyComplaints);

router.get("/stats", protect, getComplaintStats);

router.get("/:id", protect, getComplaintById);

// ==========================================
// UPDATE
// ==========================================

router.patch("/assign/:id", protect, assignComplaint);

router.patch("/resolve/:id", protect, resolveComplaint);

router.patch("/escalate/:id", protect, escalateComplaint);

router.patch("/reopen/:id", protect, reopenComplaint);

router.patch("/close/:id", protect, closeComplaint);

module.exports = router;
