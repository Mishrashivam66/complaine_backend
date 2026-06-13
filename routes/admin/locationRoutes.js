const express = require("express");

const router = express.Router();

// ==========================================
// CONTROLLERS
// ==========================================

const {
  createLocation,

  getLocations,

  updateLocation,

  deleteLocation,
} = require("../../controllers/admin/locationController");

// ==========================================
// MIDDLEWARES
// ==========================================

const {
  protect,

  authorizeRoles,
} = require("../../middleware/authMiddleware");

// ==========================================
// ADMIN ACCESS
// ==========================================

router.use(protect);

router.use(authorizeRoles("ADMIN", "SUPER_ADMIN"));

// ==========================================
// ROUTES
// ==========================================

// CREATE
router.post("/", createLocation);

// GET
router.get("/", getLocations);

// UPDATE
router.put("/:id", updateLocation);

// DELETE
router.delete("/:id", deleteLocation);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
