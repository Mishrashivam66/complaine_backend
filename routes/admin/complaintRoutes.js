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

const { protect } = require("../../middleware/authMiddleware");
// ==========================================
// TEST ROUTE
// ==========================================

router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Complaint route working",
  });
});

// ==========================================
// CREATE
// ==========================================

router.post("/create", protect, createComplaint);

// ==========================================
// GET
// ==========================================

// ALL COMPLAINTS

router.get("/all", protect, getAllComplaints);

// MY COMPLAINTS

router.get("/my", protect, getMyComplaints);

// STATS

router.get("/stats", protect, getComplaintStats);

// SINGLE

router.get("/:id", protect, getComplaintById);

// ==========================================
// UPDATE
// ==========================================

// ASSIGN

router.patch("/assign/:id", protect, assignComplaint);

// RESOLVE

router.patch("/resolve/:id", protect, resolveComplaint);

// ESCALATE

router.patch("/escalate/:id", protect, escalateComplaint);

// REOPEN

router.patch("/reopen/:id", protect, reopenComplaint);

// CLOSE

router.patch("/close/:id", protect, closeComplaint);

module.exports = router;
