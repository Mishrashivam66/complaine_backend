"use strict";

const express = require("express");
const router = express.Router();

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

const complaint = require("../../controllers/admin/complaintController");

const report = require("../../controllers/admin/complaintReportController");

const manager = require("../../controllers/maintenance/managerComplaintActionsController");

// ==========================================
// HEALTH CHECK
// ==========================================

router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Complaint API working",
  });
});

// ==========================================
// AUTHENTICATION
// ==========================================

router.use(protect);

// ==========================================
// EXCEL / PDF REPORTS
// ==========================================

router.get("/report", authorizeRoles("ADMIN"), report.downloadComplaintReport);

// ==========================================
// TECHNICIAN DIRECTORY
// ==========================================

router.get(
  "/technicians",
  authorizeRoles("MAINTENANCE_MANAGER"),
  manager.getTechnicians,
);

// ==========================================
// MANAGER ACTION AUDIT HISTORY
// ==========================================

router.get(
  "/actions/:id",
  authorizeRoles("ADMIN", "MAINTENANCE_MANAGER"),
  manager.getActionHistory,
);

// ==========================================
// CREATE COMPLAINT
// ==========================================

router.post("/create", authorizeRoles("ADMIN"), complaint.createComplaint);

// ==========================================
// GET COMPLAINTS
// ==========================================

router.get(
  "/all",
  authorizeRoles("ADMIN", "MAINTENANCE_MANAGER"),
  complaint.getAllComplaints,
);

router.get("/my", complaint.getMyComplaints);

router.get(
  "/stats",
  authorizeRoles("ADMIN", "MAINTENANCE_MANAGER"),
  complaint.getComplaintStats,
);

// Keep dynamic ID route after static GET routes.
router.get("/:id", complaint.getComplaintById);

// ==========================================
// ASSIGN TECHNICIAN
// ==========================================

router.patch(
  "/assign/:id",
  authorizeRoles("MAINTENANCE_MANAGER"),
  manager.assignAvailableTechnician,
);

// ==========================================
// VERIFY TECHNICIAN COMPLETION
// ==========================================

router.patch(
  "/verify/:id",
  authorizeRoles("MAINTENANCE_MANAGER"),
  manager.verifyCompletion,
);

// Legacy verification URL preserved.
// Uses same guarded verification logic.
router.patch(
  "/resolve/:id",
  authorizeRoles("MAINTENANCE_MANAGER"),
  manager.verifyCompletion,
);

// ==========================================
// RETURN FOR CORRECTION
// ==========================================

router.patch(
  "/correction/:id",
  authorizeRoles("MAINTENANCE_MANAGER"),
  manager.returnForCorrection,
);

// ==========================================
// ESCALATE
// ==========================================

router.patch(
  "/escalate/:id",
  authorizeRoles("MAINTENANCE_MANAGER"),
  complaint.escalateComplaint,
);

// ==========================================
// CLOSE VERIFIED COMPLAINT
// ==========================================

router.patch(
  "/close/:id",
  authorizeRoles("MAINTENANCE_MANAGER"),
  manager.closeVerifiedComplaint,
);

// ==========================================
// NOT SATISFIED FEEDBACK
// ==========================================

router.patch("/reopen/:id", manager.notSatisfiedFeedback);

module.exports = router;
