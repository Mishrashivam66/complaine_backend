const express = require("express");

const router = express.Router();

const {
  createComplaint,

  getStudentComplaints,

  getAllMessComplaints,

  getSingleComplaint,

  updateComplaintStatus,

  deleteComplaint,
} = require("../../controllers/student/messController");

const {
  protect,

  authorizeRoles,
} = require("../../middleware/authMiddleware");

// ==========================================
// STUDENT CREATE COMPLAINT
// ==========================================

router.post(
  "/complaint/create",

  protect,

  createComplaint,
);

// ==========================================
// STUDENT GET OWN COMPLAINTS
// ==========================================

router.get(
  "/complaints",

  protect,

  getStudentComplaints,
);

// ==========================================
// MESS MANAGER / ADMIN
// GET ALL COMPLAINTS
// ==========================================

router.get(
  "/all",

  protect,

  authorizeRoles("MESS_MANAGER", "ADMIN", "WARDEN"),

  getAllMessComplaints,
);

// ==========================================
// GET SINGLE COMPLAINT
// ==========================================

router.get(
  "/:id",

  protect,

  getSingleComplaint,
);

// ==========================================
// UPDATE STATUS
// ==========================================

router.put(
  "/:id/status",

  protect,

  authorizeRoles("MESS_MANAGER", "ADMIN", "WARDEN"),

  updateComplaintStatus,
);

// ==========================================
// DELETE COMPLAINT
// ==========================================

router.delete(
  "/complaints/:id",

  protect,

  deleteComplaint,
);

module.exports = router;
