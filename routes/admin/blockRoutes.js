"use strict";

const express = require("express");

const router = express.Router();

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

const {
  getBlocks,
  createBlock,
  updateBlock,
} = require("../../controllers/admin/blockController");

// ==========================================
// ADMIN AUTHENTICATION
// ==========================================

router.use(protect);
router.use(authorizeRoles("ADMIN"));

// ==========================================
// GET ALL ACADEMIC BLOCKS
// ==========================================

router.get("/", getBlocks);

// ==========================================
// CREATE ACADEMIC BLOCK
// ==========================================

router.post("/", createBlock);

// ==========================================
// UPDATE ACADEMIC BLOCK
// ==========================================

router.put("/:id", updateBlock);

// ==========================================
// EXPORT EXPRESS ROUTER
// ==========================================

module.exports = router;
