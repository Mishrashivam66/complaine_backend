"use strict";

const express = require("express");

const router = express.Router();

// ==========================================
// ADMIN CONTROLLERS
// ==========================================

const { createUser } = require("../../controllers/admin/createUserController");

// ==========================================
// ROUTES
// ==========================================

const studentRoutes = require("./studentRoutes");
const userRoutes = require("./userRoutes");
const locationRoutes = require("./locationRoutes");
const buildingRoutes = require("./buildingRoutes");
const blockRoutes = require("./blockRoutes");
const categoryRoutes = require("./categoryRoutes");

// ==========================================
// MIDDLEWARE
// ==========================================

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

// ==========================================
// VALIDATE ROUTER EXPORTS
// ==========================================

const mountRouter = (path, route, filename) => {
  if (typeof route !== "function") {
    throw new TypeError(
      `${filename} must export an Express Router. ` +
        `Received: ${typeof route}. ` +
        `Check module.exports = router;`,
    );
  }

  router.use(path, route);
};

// ==========================================
// AUTHENTICATE ADMIN ROUTES
// ==========================================

router.use(protect);

// ==========================================
// CATEGORY ROUTES
// Keep existing category middleware behavior.
// ==========================================

mountRouter("/categories", categoryRoutes, "categoryRoutes.js");

// ==========================================
// ADMIN ONLY ACCESS
// ==========================================

router.use(authorizeRoles("ADMIN"));

// ==========================================
// CREATE USERS
// ==========================================

router.post("/create-user", createUser);

// ==========================================
// USER MANAGEMENT
// ==========================================

mountRouter("/users", userRoutes, "userRoutes.js");

// ==========================================
// LOCATION MANAGEMENT
// ==========================================

mountRouter("/locations", locationRoutes, "locationRoutes.js");

// ==========================================
// BUILDING MANAGEMENT
// ==========================================

mountRouter("/buildings", buildingRoutes, "buildingRoutes.js");

// ==========================================
// ACADEMIC BLOCK MANAGEMENT
// ==========================================

mountRouter("/blocks", blockRoutes, "blockRoutes.js");

// ==========================================
// STUDENT MANAGEMENT
// ==========================================

mountRouter("/students", studentRoutes, "studentRoutes.js");

// ==========================================
// TEST
// ==========================================

router.get("/", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "AmiMaintain Admin API Working",
  });
});

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;
