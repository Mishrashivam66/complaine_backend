const express = require("express");

const router = express.Router();

// ==========================================
// CONTROLLER
// ==========================================

const {
  getEmergencyAlerts,

  updateAlertStatus,

  deleteAlert,

  createEmergencyAlert,
} = require("../../controllers/warden/emergencyController");

// ==========================================
// MIDDLEWARE
// ==========================================

const {
  protect,

  authorizeRoles,
} = require("../../middleware/authMiddleware");

// ==========================================
// WARDEN ONLY
// ==========================================

router.use(protect);

router.use(authorizeRoles("WARDEN"));

// ==========================================
// ROUTES
// ==========================================

// GET ALERTS

router.post(
  "/create",

  createEmergencyAlert,
);

router.get(
  "/",

  getEmergencyAlerts,
);

// UPDATE STATUS

router.put(
  "/:id/status",

  updateAlertStatus,
);

// DELETE ALERT

router.delete(
  "/:id",

  deleteAlert,
);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
