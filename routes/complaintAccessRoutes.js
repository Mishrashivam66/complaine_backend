"use strict";

const express = require("express");

const router = express.Router();

const { protect, authorizeRoles } = require("../middleware/authMiddleware");

const access = require("../controllers/complaintAccessController");

router.use(protect);

// Student can view own status.
router.get("/me", authorizeRoles("STUDENT"), access.myComplaintAccess);

// Warden / Block Admin read-only.
router.get(
  "/visible",
  authorizeRoles("WARDEN", "BLOCK_ADMIN", "ADMIN"),
  access.visibleBlockedStudents,
);

// Admin only.
router.get("/admin/:id", authorizeRoles("ADMIN"), access.getStudentAccess);

router.patch("/admin/:id", authorizeRoles("ADMIN"), access.changeStudentAccess);

module.exports = router;
