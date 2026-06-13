const express = require("express");

const router = express.Router();

// ==========================================
// CONTROLLER
// ==========================================

const {
  getRooms,

  assignRoom,

  removeRoom,
  createRoom,

  getUnallocatedStudents,
} = require("../../controllers/warden/roomAllocationController");

// ==========================================
// MIDDLEWARE
// ==========================================

const {
  protect,

  authorizeRoles,
} = require("../../middleware/authMiddleware");

// ==========================================
// WARDEN ONLY
// ==========================================

router.use(protect);

router.use(authorizeRoles("WARDEN"));

// ==========================================
// ROUTES
// ==========================================

// GET ALL ROOMS

router.get("/", getRooms);

// GET UNALLOCATED STUDENTS

router.get("/unallocated", getUnallocatedStudents);

// ASSIGN ROOM

router.put("/assign", assignRoom);

// REMOVE ROOM

router.put("/remove", removeRoom);

// CREATE ROOM

router.post("/create", createRoom);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
