"use strict";

const express = require("express");

const router = express.Router();

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

const {
  getBlocks,
  createBlock,
  updateBlock,
  archiveBlock,
  restoreBlock,
} = require("../../controllers/admin/blockController");

// ==========================================
// ADMIN ACCESS ONLY
// ==========================================

router.use(protect);
router.use(authorizeRoles("ADMIN"));

// ==========================================
// GET BLOCKS
// ==========================================

router.get("/", getBlocks);

// ==========================================
// CREATE BLOCK
// ==========================================

router.post("/", createBlock);

// ==========================================
// UPDATE BLOCK
// ==========================================

router.put("/:id", updateBlock);

// ==========================================
// ARCHIVE BLOCK
// ==========================================

router.delete("/:id", archiveBlock);

// ==========================================
// RESTORE BLOCK
// ==========================================

router.patch("/:id/restore", restoreBlock);

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;
