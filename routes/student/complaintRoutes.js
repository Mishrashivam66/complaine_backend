const express = require("express");

const router = express.Router();

// ==========================================
// CONTROLLERS
// ==========================================

const {
  createComplaint,

  getAllComplaints,

  getMyComplaints,

  getComplaintById,

  updateComplaintStatus,

  assignComplaint,

  reopenComplaint,
} = require("../../controllers/student/complaintController");

// ==========================================
// MIDDLEWARE
// ==========================================

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

// ==========================================
// CREATE COMPLAINT
// ==========================================

router.post(
  "/create",

  protect,

  createComplaint,
);

// ==========================================
// GET MY COMPLAINTS
// ==========================================

router.get(
  "/my-complaints",

  protect,

  getMyComplaints,
);

// ==========================================
// GET SINGLE COMPLAINT
// ==========================================

router.get(
  "/:id",

  protect,

  getComplaintById,
);

// ==========================================
// GET ALL COMPLAINTS
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

router.put(
  "/reopen/:id",

  protect,

  reopenComplaint,
);

// ==========================================
// TEST ROUTE
// ==========================================

router.get(
  "/test/api",

  (req, res) => {
    res.json({
      success: true,

      message: "Complaint Routes Working",
    });
  },
);

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;
