const express = require("express");

const router = express.Router();

// ==========================================
// IMPORT CONTROLLERS
// ==========================================

const {
  getAllMaterialRequests,

  createMaterialRequest,

  updateMaterialRequestStatus,

  deleteMaterialRequest,
} = require("../../controllers/maintenance/materialRequestController");

// ==========================================
// IMPORT MIDDLEWARE
// ==========================================

const { protect } = require("../../middleware/authMiddleware");

const roleMiddleware = require("../../middleware/roleMiddleware");

// ==========================================
// GET ALL REQUESTS
// ==========================================

router.get(
  "/",

  protect,

  roleMiddleware("MAINTENANCE_MANAGER", "STORE_MANAGER", "WORKER"),

  getAllMaterialRequests,
);

// ==========================================
// CREATE REQUEST
// ==========================================

router.post(
  "/create",

  protect,

  roleMiddleware("MAINTENANCE_MANAGER", "WORKER"),

  createMaterialRequest,
);

// ==========================================
// UPDATE STATUS
// ==========================================

router.put(
  "/update-status/:id",

  protect,

  roleMiddleware("STORE_MANAGER", "MAINTENANCE_MANAGER"),

  updateMaterialRequestStatus,
);

// ==========================================
// DELETE REQUEST
// ==========================================

router.delete(
  "/:id",

  protect,

  roleMiddleware("MAINTENANCE_MANAGER"),

  deleteMaterialRequest,
);

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;
