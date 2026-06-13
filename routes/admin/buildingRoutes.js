const express = require("express");

const router = express.Router();

// ==========================================
// CONTROLLERS
// ==========================================

const {
  createBuilding,

  getBuildings,

  updateBuilding,

  deleteBuilding,
} = require("../../controllers/admin/buildingController");

// ==========================================
// MIDDLEWARE
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
router.post("/", createBuilding);

// GET ALL
router.get("/", getBuildings);

// UPDATE
router.put("/:id", updateBuilding);

// DELETE
router.delete("/:id", deleteBuilding);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
