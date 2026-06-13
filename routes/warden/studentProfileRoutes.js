const express = require("express");

const router = express.Router();

// ==========================================
// CONTROLLER
// ==========================================

const {
  getStudentProfile,

  lockProfile,

  unlockProfile,

  approveStudent,

  rejectStudent,

  removeFromHostel,

  deleteStudent,

  updateRoom,
} = require("../../controllers/warden/studentProfileController");

// ==========================================
// MIDDLEWARE
// ==========================================

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

// ==========================================
// WARDEN ONLY
// ==========================================

router.use(protect);

router.use(authorizeRoles("WARDEN"));

// ==========================================
// ROUTES
// ==========================================

// GET PROFILE

// ==========================================
// LOCK PROFILE
// ==========================================

router.put("/lock/:id", lockProfile);

// ==========================================
// UNLOCK PROFILE
// ==========================================

router.put("/unlock/:id", unlockProfile);

// ==========================================
// APPROVE STUDENT
// ==========================================

router.put("/approve/:id", approveStudent);

// ==========================================
// REJECT STUDENT
// ==========================================

router.delete("/reject/:id", rejectStudent);

// ==========================================
// REMOVE HOSTEL
// ==========================================

router.put("/remove-hostel/:id", removeFromHostel);

// ==========================================
// CHANGE ROOM
// ==========================================

router.put("/change-room/:id", updateRoom);

// ==========================================
// DELETE STUDENT
// ==========================================

router.delete("/delete/:id", deleteStudent);

// ==========================================
// GET PROFILE
// KEEP THIS LAST
// ==========================================

router.get("/:id", getStudentProfile);

module.exports = router;
