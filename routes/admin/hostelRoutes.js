"use strict";

const express = require("express");
const router = express.Router();

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

const {
  createHostel,
  getAllHostels,
  updateHostel,
  deleteHostel,
  restoreHostel,
  permanentDeleteHostel,
} = require("../../controllers/admin/hostelController");

// ==========================================
// ADMIN AUTHORIZATION
// ==========================================

router.use(protect, authorizeRoles("ADMIN"));

// ==========================================
// GET ALL HOSTELS
// ==========================================

router.get("/all", getAllHostels);

// ==========================================
// CREATE HOSTEL
// ==========================================

router.post("/create", createHostel);

// ==========================================
// UPDATE HOSTEL
// ==========================================

router.put("/update/:id", updateHostel);

// ==========================================
// ARCHIVE HOSTEL
// ==========================================

router.delete("/delete/:id", deleteHostel);

// ==========================================
// RESTORE HOSTEL
// ==========================================

router.patch("/restore/:id", restoreHostel);

// ==========================================
// PERMANENT DELETE
// ==========================================

router.delete("/permanent/:id", permanentDeleteHostel);

module.exports = router;
