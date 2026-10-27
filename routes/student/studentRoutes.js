"use strict";

const express = require("express");

const router = express.Router();

// =====================================================
// EXISTING COMPLAINT ROUTES
// =====================================================

const complaintRoutes = require("./complaintRoutes");
const {
  getMyHostelWardens,
} = require("../../controllers/student/studentHostelWardensController");
// =====================================================
// CONTROLLERS
// =====================================================

const { changePassword } = require("../../controllers/auth/passwordController");

const {
  getCategoriesForStudents,
} = require("../../controllers/student/complaintController");

const {
  getComplaintFormConfig,
} = require("../../controllers/student/complaintFormConfigController");

const {
  verifyComplaintByStudent,
} = require("../../controllers/student/complaintVerificationController");

// =====================================================
// AUTH MIDDLEWARE
// =====================================================

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

// =====================================================
// TEST ROUTE
// =====================================================

router.get("/", (req, res) => {
  return res.json({
    success: true,
    message: "AMI MAINTENANCE - Student Routes Working",
  });
});

// =====================================================
// CHANGE PASSWORD - EXISTING ROUTE
// =====================================================

router.put("/change-password", protect, changePassword);

// =====================================================
// FETCH ACTIVE MAINTENANCE CATEGORIES
// =====================================================

router.get(
  "/categories",
  protect,
  authorizeRoles("STUDENT"),
  getCategoriesForStudents,
);

// =====================================================
// CREATE COMPLAINT FORM CONFIGURATION
// =====================================================

router.get(
  "/complaint-form-config",
  protect,
  authorizeRoles("STUDENT"),
  getComplaintFormConfig,
);

// =====================================================
// STUDENT SATISFACTION VERIFICATION
//
// POST /api/student/complaints/:id/verify
// =====================================================

router.post(
  "/complaints/:id/verify",

  protect,

  authorizeRoles("STUDENT"),

  verifyComplaintByStudent,
);

// =====================================================
// EXISTING COMPLAINT ROUTES
//
// Keep after verification route.
// =====================================================

router.use("/complaints", complaintRoutes);

router.get(
  "/hostel/wardens",
  protect,
  authorizeRoles("STUDENT"),
  getMyHostelWardens,
);

// =====================================================
// EXPORT
// =====================================================

module.exports = router;
