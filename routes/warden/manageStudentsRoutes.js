const express = require("express");

const router = express.Router();

// ==========================================
// CONTROLLERS
// ==========================================

const {
  getAllStudents,

  getStudentById,

  updateStudent,

  deleteStudent,
} = require("../../controllers/warden/manageStudentsController");

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
// ROUTES
// ==========================================

router.get(
  "/",

  getAllStudents,
);

router.get(
  "/:id",

  getStudentById,
);

router.put(
  "/:id",

  updateStudent,
);

router.delete(
  "/:id",

  deleteStudent,
);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
