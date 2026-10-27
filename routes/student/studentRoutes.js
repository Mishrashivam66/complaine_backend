"use strict";

const express = require("express");
const router = express.Router();

// =====================================================
// IMPORT COMPLAINT ROUTES
// =====================================================

const complaintRoutes = require("./complaintRoutes");

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

// =====================================================
// AUTHENTICATION MIDDLEWARE
// =====================================================

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

// =====================================================
// TEST ROUTE
// =====================================================

router.get("/", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "AMI MAINTENANCE - Student Routes Working",
  });
});

// =====================================================
// CHANGE PASSWORD
// Existing API preserved for compatibility
// =====================================================

router.put("/change-password", protect, changePassword);

// =====================================================
// ADMIN-CREATED MAINTENANCE CATEGORIES
// Student can only VIEW categories
// =====================================================

router.get(
  "/categories",
  protect,
  authorizeRoles("STUDENT"),
  getCategoriesForStudents,
);

// =====================================================
// CREATE COMPLAINT - FORM CONFIGURATION
//
// Fetches:
// 1. Active Admin-created Hostels
// 2. Active Admin-created Academic Blocks
// 3. Active Admin-created Other Locations
// 4. Active Admin-created Maintenance Categories
// 5. Category subcategories and default priority
//
// STUDENT READ-ONLY ACCESS
// =====================================================

router.get(
  "/complaint-form-config",
  protect,
  authorizeRoles("STUDENT"),
  getComplaintFormConfig,
);

// =====================================================
// STUDENT COMPLAINT ROUTES
// Existing complaint APIs preserved
// =====================================================

router.use("/complaints", complaintRoutes);

// =====================================================
// EXPORT
// =====================================================

module.exports = router;
