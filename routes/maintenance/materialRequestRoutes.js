const express = require("express");

const router = express.Router();

const {
  getAllMaterialRequests,
  createMaterialRequest,
  deleteMaterialRequest,
} = require("../../controllers/maintenance/materialRequestController");

const { protect } = require("../../middleware/authMiddleware");

const roleMiddleware = require("../../middleware/roleMiddleware");

// ==========================================
// GET MATERIAL REQUESTS
// ==========================================

router.get(
  "/",
  protect,

  roleMiddleware("MAINTENANCE_MANAGER", "STORE_MANAGER"),

  getAllMaterialRequests,
);

// ==========================================
// CREATE MATERIAL REQUEST
// ==========================================

router.post(
  "/create",
  protect,

  roleMiddleware("MAINTENANCE_MANAGER"),

  createMaterialRequest,
);

// ==========================================
// DELETE MATERIAL REQUEST
// ==========================================

router.delete(
  "/:id",
  protect,

  roleMiddleware("MAINTENANCE_MANAGER"),

  deleteMaterialRequest,
);

module.exports = router;
