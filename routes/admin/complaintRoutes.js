"use strict";

const express = require("express");
const router = express.Router();

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

const controller = require("../../controllers/admin/complaintController");

// ==========================================
// ROUTE HEALTH CHECK
// ==========================================

router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Complaint route working",
  });
});

// ==========================================
// AUTHENTICATION
// ==========================================

router.use(protect);

// ==========================================
// CREATE COMPLAINT
// ==========================================

router.post("/create", authorizeRoles("ADMIN"), controller.createComplaint);

// ==========================================
// GET COMPLAINTS
// ==========================================

router.get(
  "/all",
  authorizeRoles("ADMIN", "MAINTENANCE_MANAGER"),
  controller.getAllComplaints,
);

router.get("/my", controller.getMyComplaints);

router.get(
  "/stats",
  authorizeRoles("ADMIN", "MAINTENANCE_MANAGER"),
  controller.getComplaintStats,
);

router.get("/:id", controller.getComplaintById);

// ==========================================
// TECHNICIAN ASSIGNMENT
// ==========================================

router.patch(
  "/assign/:id",
  authorizeRoles("MAINTENANCE_MANAGER"),
  controller.assignComplaint,
);

// ==========================================
// MANAGER VERIFICATION
// ==========================================

router.patch(
  "/resolve/:id",
  authorizeRoles("MAINTENANCE_MANAGER"),
  controller.resolveComplaint,
);

// ==========================================
// ESCALATION
// ==========================================

router.patch(
  "/escalate/:id",
  authorizeRoles("MAINTENANCE_MANAGER"),
  controller.escalateComplaint,
);

// ==========================================
// CLOSE COMPLAINT
// ==========================================

router.patch(
  "/close/:id",
  authorizeRoles("MAINTENANCE_MANAGER"),
  controller.closeComplaint,
);

// ==========================================
// NOT SATISFIED FEEDBACK
// LEGACY URL PRESERVED
// ==========================================

router.patch("/reopen/:id", controller.reopenComplaint);

module.exports = router;
