"use strict";

const express = require("express");
const router = express.Router();

const { createUser } = require("../../controllers/admin/createUserController");

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

// ==========================================
// EXISTING ADMIN ROUTES
// ==========================================

const studentRoutes = require("./studentRoutes");

const userRoutes = require("./userRoutes");

const locationRoutes = require("./locationRoutes");

const buildingRoutes = require("./buildingRoutes");

const blockRoutes = require("./blockRoutes");

const categoryRoutes = require("./categoryRoutes");

// ==========================================
// NEW OTHER LOCATIONS ROUTES
// ==========================================

const otherLocationRoutes = require("./otherLocationRoutes");

// ==========================================
// AUTHENTICATION
// ==========================================

router.use(protect);

// Existing category routing.
router.use("/categories", categoryRoutes);

// ADMIN ONLY
router.use(authorizeRoles("ADMIN"));

// ==========================================
// USER MANAGEMENT
// ==========================================

router.post("/create-user", createUser);

router.use("/users", userRoutes);

router.use("/students", studentRoutes);

// ==========================================
// CAMPUS MASTER DATA
// ==========================================

// Legacy routes retained for compatibility.
router.use("/locations", locationRoutes);

router.use("/buildings", buildingRoutes);

// Academic Blocks.
router.use("/blocks", blockRoutes);

// New Other Locations master.
router.use("/other-locations", otherLocationRoutes);

// ==========================================
// TEST
// ==========================================

router.get("/", (req, res) => {
  return res.json({
    success: true,
    message: "AmiMaintain Admin API Working",
  });
});

module.exports = router;
