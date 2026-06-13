const express = require("express");

const router = express.Router();

// ==========================================
// CONTROLLERS
// ==========================================

const {
  getPendingStudents,

  approveStudent,
} = require("../../controllers/warden/pendingStudentController");

// ==========================================
// MIDDLEWARE
// ==========================================

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

// ==========================================
// WARDEN ONLY
// ==========================================

router.use(protect);

router.use(authorizeRoles("WARDEN"));

// ==========================================
// GET PENDING STUDENTS
// ==========================================

router.get(
  "/pending",

  getPendingStudents,
);

// ==========================================
// APPROVE STUDENT
// ==========================================

router.put(
  "/approve/:id",

  approveStudent,
);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
