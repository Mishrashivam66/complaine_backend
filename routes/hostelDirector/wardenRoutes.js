const express = require("express");

const router = express.Router();

const {
  createWarden,
  getAllWardens,
  getWardenById,
  updateWarden,
  deleteWarden,
} = require("../../controllers/hostelDirector/wardenController");

const { protect } = require("../../middleware/authMiddleware");

const roleMiddleware = require("../../middleware/roleMiddleware");

// ==========================================
// CREATE WARDEN
// ==========================================

router.post("/", protect, roleMiddleware("HOSTEL_DIRECTOR"), createWarden);

// ==========================================
// GET ALL WARDENS
// ==========================================

router.get("/", protect, roleMiddleware("HOSTEL_DIRECTOR"), getAllWardens);

// ==========================================
// GET SINGLE WARDEN
// ==========================================

router.get("/:id", protect, roleMiddleware("HOSTEL_DIRECTOR"), getWardenById);

// ==========================================
// UPDATE WARDEN
// ==========================================

router.put("/:id", protect, roleMiddleware("HOSTEL_DIRECTOR"), updateWarden);

// ==========================================
// DELETE WARDEN
// ==========================================

router.delete("/:id", protect, roleMiddleware("HOSTEL_DIRECTOR"), deleteWarden);

module.exports = router;
