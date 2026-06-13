const express = require("express");

const router = express.Router();

// ==========================================
// CONTROLLERS
// ==========================================

const {
  createHostel,

  getAllHostels,

  updateHostel,

  deleteHostel,
} = require("../../controllers/admin/hostelController");

// ==========================================
// MIDDLEWARE
// ==========================================

const {
  protect,

  authorizeRoles,
} = require("../../middleware/authMiddleware");

// ==========================================
// ADMIN ONLY ACCESS
// ==========================================

router.use(protect);

router.use(authorizeRoles("ADMIN", "SUPER_ADMIN"));

// ==========================================
// CREATE HOSTEL
// ==========================================

router.post("/create", createHostel);

// ==========================================
// GET ALL HOSTELS
// ==========================================

router.get("/all", getAllHostels);

// ==========================================
// UPDATE HOSTEL
// ==========================================

router.put("/update/:id", updateHostel);

// ==========================================
// DELETE HOSTEL
// ==========================================

router.delete("/delete/:id", deleteHostel);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
