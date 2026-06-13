const express = require("express");

const router = express.Router();

// ==========================================
// IMPORT CONTROLLER
// ==========================================

const {
  getOverdueComplaints,

  getSingleOverdueComplaint,

  escalateComplaint,
} = require("../../controllers/maintenance/overdueComplaintController");

// ==========================================
// IMPORT MIDDLEWARE
// ==========================================

const { protect } = require("../../middleware/authMiddleware");

const roleMiddleware = require("../../middleware/roleMiddleware");

// ==========================================
// MANAGER ACCESS
// ==========================================

const managerAccess = [protect, roleMiddleware("MAINTENANCE_MANAGER")];

// ==========================================
// GET OVERDUE COMPLAINTS
// ==========================================

router.get(
  "/",

  ...managerAccess,

  getOverdueComplaints,
);

// ==========================================
// GET SINGLE OVERDUE COMPLAINT
// ==========================================

router.get(
  "/:id",

  ...managerAccess,

  getSingleOverdueComplaint,
);

// ==========================================
// ESCALATE COMPLAINT
// ==========================================

router.put(
  "/escalate/:id",

  ...managerAccess,

  escalateComplaint,
);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
