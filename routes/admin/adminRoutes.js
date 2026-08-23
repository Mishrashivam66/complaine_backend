const express = require("express");

const router = express.Router();

// ==========================================
// CONTROLLERS
// ==========================================

const { createUser } = require("../../controllers/admin/createUserController");

// ==========================================
// ROUTES IMPORT
// ==========================================

const studentRoutes = require("./studentRoutes");

const userRoutes = require("./userRoutes");

const locationRoutes = require("./locationRoutes");

const buildingRoutes = require("./buildingRoutes");

const categoryRoutes = require("./categoryRoutes");

// ==========================================
// MIDDLEWARES
// ==========================================

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

// ==========================================
// PROTECTED ROUTES
// ==========================================

router.use(protect);

// ==========================================
// CATEGORY ROUTES
// ==========================================

router.use("/categories", categoryRoutes);

// ==========================================
// ADMIN ONLY ACCESS
// ==========================================

router.use(authorizeRoles("ADMIN", "SUPER_ADMIN"));

// ==========================================
// USER ROUTES
// ==========================================

router.use("/users", userRoutes);

// ==========================================
// LOCATION ROUTES
// ==========================================

router.use("/locations", locationRoutes);

// ==========================================
// BUILDING ROUTES
// ==========================================

router.use("/buildings", buildingRoutes);

// ==========================================
// CREATE USER
// ==========================================

router.post("/create-user", createUser);

// ==========================================
// STUDENT ROUTES
// ==========================================

router.use("/students", studentRoutes);

// ==========================================
// TEST ROUTE
// ==========================================

router.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Admin Route Working",
  });
});

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;
