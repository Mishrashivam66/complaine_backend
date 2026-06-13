const express = require("express");

const router = express.Router();

// ==========================================
// CONTROLLER IMPORTS
// ==========================================

const {
  createEscalation,

  getEscalations,

  getSingleEscalation,

  updateEscalationStatus,

  deleteEscalation,
} = require("../../controllers/warden/escalationController");

// ==========================================
// MIDDLEWARE IMPORTS
// ==========================================

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

// const { authorizeRoles } = require("../../middleware/roleMiddleware");

// ==========================================
// CREATE ESCALATION
// ==========================================

router.post(
  "/create",
  protect,
  authorizeRoles("warden", "admin"),
  createEscalation,
);

// ==========================================
// GET ALL ESCALATIONS
// ==========================================

router.get("/", protect, authorizeRoles("warden", "admin"), getEscalations);

// ==========================================
// GET SINGLE ESCALATION
// ==========================================

router.get("/:id", protect, getSingleEscalation);

// ==========================================
// UPDATE ESCALATION STATUS
// ==========================================

router.put(
  "/:id/status",
  protect,
  authorizeRoles("warden", "admin"),
  updateEscalationStatus,
);

// ==========================================
// DELETE ESCALATION
// ==========================================

router.delete(
  "/:id",
  protect,
  authorizeRoles("warden", "admin"),
  deleteEscalation,
);

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;
