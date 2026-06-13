const express = require("express");

const router = express.Router();

// ==========================================
// IMPORT ROUTES
// ==========================================

const complaintRoutes = require("./complaintRoutes");

// ==========================================
// CONTROLLERS
// ==========================================

const { changePassword } = require("../../controllers/auth/passwordController");

const {
  getCategoriesForStudents,
} = require("../../controllers/student/complaintController");
// ==========================================
// MIDDLEWARE
// ==========================================

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

// ==========================================
// TEST ROUTE
// ==========================================

router.get("/", (req, res) => {
  res.json({
    success: true,

    message: "Student Routes Working",
  });
});

// ==========================================
// CHANGE PASSWORD
// ==========================================

router.put(
  "/change-password",

  protect,

  changePassword,
);

// ==========================================
// GET CATEGORIES
// ==========================================

router.get(
  "/categories",

  protect,

  getCategoriesForStudents,
);

// ==========================================
// COMPLAINT ROUTES
// ==========================================

router.use(
  "/complaints",

  complaintRoutes,
);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
