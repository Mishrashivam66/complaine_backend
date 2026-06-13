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
const wardenRoutes = require("./wardenRoutes");
const userRoutes = require("./userRoutes");

const locationRoutes = require("./locationRoutes");

const buildingRoutes = require("./buildingRoutes");

const categoryRoutes = require("./categoryRoutes");

// ==========================================
// MIDDLEWARES
// ==========================================

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

// ==========================================
// ADMIN ONLY ACCESS
// ==========================================

router.use(protect);

router.use(authorizeRoles("ADMIN", "SUPER_ADMIN"));
router.use("/users", userRoutes);

router.use("/categories", categoryRoutes);

// ==========================================
// TEST ROUTE
// ==========================================

router.get("/", (req, res) => {
  res.json({
    success: true,

    message: "Admin Route Working",
  });
});
router.use("/wardens", wardenRoutes);
router.use("/locations", locationRoutes);
router.use("/buildings", buildingRoutes);
// ==========================================
// CREATE USER
// ==========================================

router.post(
  "/create-user",

  createUser,
);

// ==========================================
// STUDENT ROUTES
// ==========================================

router.use(
  "/students",

  studentRoutes,
);

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;
