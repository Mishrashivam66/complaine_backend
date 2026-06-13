const express = require("express");

const router = express.Router();

// ==========================================
// CONTROLLERS
// ==========================================

const {
  createWarden,

  getAllWardens,

  deleteWarden,

  updateWarden,
} = require("../../controllers/admin/wardenController");

// ==========================================
// MIDDLEWARE
// ==========================================

const {
  protect,

  authorizeRoles,
} = require("../../middleware/authMiddleware");

// ==========================================
// ADMIN ONLY
// ==========================================

router.use(protect);

router.use(authorizeRoles("ADMIN"));

// ==========================================
// CREATE WARDEN
// ==========================================

router.post("/create", createWarden);

// ==========================================
// GET ALL WARDENS
// ==========================================

router.get("/", getAllWardens);

// ==========================================
// UPDATE WARDEN
// ==========================================

router.put("/:id", updateWarden);

// ==========================================
// DELETE WARDEN
// ==========================================

router.delete("/:id", deleteWarden);

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;
