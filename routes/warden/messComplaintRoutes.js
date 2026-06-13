const express = require("express");

const router = express.Router();

const {
  createMessComplaint,

  getMessComplaints,

  getSingleMessComplaint,

  updateMessComplaintStatus,

  deleteMessComplaint,
} = require("../../controllers/warden/messComplaintController");

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

// const { authorizeRoles } = require("../../middleware/roleMiddleware");

// ==========================================
// CREATE
// ==========================================

router.post("/create", protect, authorizeRoles("student"), createMessComplaint);

// ==========================================
// GET ALL
// ==========================================

router.get("/", protect, authorizeRoles("warden", "admin"), getMessComplaints);

// ==========================================
// GET SINGLE
// ==========================================

router.get("/:id", protect, getSingleMessComplaint);

// ==========================================
// UPDATE STATUS
// ==========================================

router.put(
  "/:id/status",
  protect,
  authorizeRoles("warden", "admin"),
  updateMessComplaintStatus,
);

// ==========================================
// DELETE
// ==========================================

router.delete(
  "/:id",
  protect,
  authorizeRoles("warden", "admin"),
  deleteMessComplaint,
);

module.exports = router;
