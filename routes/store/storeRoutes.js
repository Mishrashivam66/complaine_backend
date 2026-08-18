const express = require("express");

const router = express.Router();

const {
  createRequest,
  getRequests,
  updateMaterialStatus,
} = require("../../controllers/store/requestController");

const { protect } = require("../../middleware/authMiddleware");

const roleMiddleware = require("../../middleware/roleMiddleware");

// ==========================================
// CREATE GENERAL STORE REQUEST
// ==========================================

router.post(
  "/add",
  protect,
  roleMiddleware("MAINTENANCE_MANAGER"),
  createRequest,
);

// ==========================================
// GET REQUESTS
// ==========================================

router.get(
  "/all",
  protect,
  roleMiddleware("MAINTENANCE_MANAGER", "STORE_MANAGER"),
  getRequests,
);

// ==========================================
// UPDATE COMPLAINT MATERIAL ITEM STATUS
// ==========================================

router.put(
  "/update-material/:requestId/:materialId",
  protect,
  roleMiddleware("STORE_MANAGER"),
  updateMaterialStatus,
);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
