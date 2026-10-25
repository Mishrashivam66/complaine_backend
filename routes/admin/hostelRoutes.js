"use strict";

const express = require("express");
const router = express.Router();

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

const {
  createHostel,
  getAllHostels,
  getHostelDependencies,
  updateHostel,
  deleteHostel,
  restoreHostel,
  permanentDeleteHostel,
} = require("../../controllers/admin/hostelController");

router.use(protect, authorizeRoles("ADMIN"));

// List all, including archived
router.get("/all", getAllHostels);

// Check linked Wardens, residents and complaints
router.get("/:id/dependencies", getHostelDependencies);

// Create and update
router.post("/create", createHostel);
router.put("/update/:id", updateHostel);

// Archive
router.delete("/delete/:id", deleteHostel);

// Restore
router.patch("/restore/:id", restoreHostel);

// Permanently delete unreferenced hostel
router.delete("/permanent/:id", permanentDeleteHostel);

module.exports = router;
