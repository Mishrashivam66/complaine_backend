"use strict";

const express = require("express");
const router = express.Router();
const { protect, authorizeRoles } = require("../../middleware/authMiddleware");
const complaint = require("../../controllers/admin/complaintController");
const report = require("../../controllers/admin/complaintReportController");

router.get("/test", (req, res) => {
  res.json({ success: true, message: "Complaint route working" });
});

router.use(protect);

// Report must come before the dynamic "/:id" route.
router.get("/report", authorizeRoles("ADMIN"), report.downloadComplaintReport);

// Preserve existing URLs and Maintenance Manager responsibilities.
router.post("/create", authorizeRoles("ADMIN"), complaint.createComplaint);
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
router.get("/:id", complaint.getComplaintById);

router.patch(
  "/assign/:id",
  authorizeRoles("MAINTENANCE_MANAGER"),
  complaint.assignComplaint,
);
router.patch(
  "/resolve/:id",
  authorizeRoles("MAINTENANCE_MANAGER"),
  complaint.resolveComplaint,
);
router.patch(
  "/escalate/:id",
  authorizeRoles("MAINTENANCE_MANAGER"),
  complaint.escalateComplaint,
);
router.patch(
  "/close/:id",
  authorizeRoles("MAINTENANCE_MANAGER"),
  complaint.closeComplaint,
);
router.patch("/reopen/:id", complaint.reopenComplaint);

module.exports = router;
