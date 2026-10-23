"use strict";

const express = require("express");

const router = express.Router();

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

const {
  getAllOtherLocations,
  createOtherLocation,
  updateOtherLocation,
  archiveOtherLocation,
  restoreOtherLocation,
} = require("../../controllers/admin/otherLocationController");

// ==========================================
// ADMIN-ONLY ACCESS
// ==========================================

router.use(protect, authorizeRoles("ADMIN"));

// ==========================================
// LOCATION ROUTES
// ==========================================

router.get("/", getAllOtherLocations);

router.post("/", createOtherLocation);

router.put("/:id", updateOtherLocation);

router.delete("/:id", archiveOtherLocation);

router.patch("/:id/restore", restoreOtherLocation);

module.exports = router;
