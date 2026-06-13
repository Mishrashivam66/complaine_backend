const express = require("express");

const router = express.Router();

// ==========================================
// CONTROLLER IMPORTS
// ==========================================

const {
  createComplaint,

  getHostelComplaints,

  getSingleComplaint,

  updateComplaintStatus,

  assignWorker,

  escalateComplaint,

  deleteComplaint,
} = require("../../controllers/warden/complaintController");

// ==========================================
// MIDDLEWARE IMPORTS
// ==========================================

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

// ==========================================
// CREATE COMPLAINT
// STUDENT
// ==========================================

router.post("/create", protect, authorizeRoles("student"), createComplaint);

// ==========================================
// GET ALL HOSTEL COMPLAINTS
// WARDEN
// ==========================================

router.get("/", protect, authorizeRoles("warden"), getHostelComplaints);

// ==========================================
// GET SINGLE COMPLAINT
// ==========================================

router.get("/:id", protect, getSingleComplaint);

// ==========================================
// UPDATE STATUS
// WARDEN
// ==========================================

router.put(
  "/:id/status",
  protect,
  authorizeRoles("warden"),
  updateComplaintStatus,
);

// ==========================================
// ASSIGN WORKER
// WARDEN
// ==========================================

router.put("/:id/assign", protect, authorizeRoles("warden"), assignWorker);

// ==========================================
// ESCALATE COMPLAINT
// WARDEN
// ==========================================

router.put(
  "/:id/escalate",
  protect,
  authorizeRoles("warden"),
  escalateComplaint,
);

// ==========================================
// DELETE COMPLAINT
// ADMIN / WARDEN
// ==========================================

router.delete(
  "/:id",
  protect,
  authorizeRoles("admin", "warden"),
  deleteComplaint,
);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
