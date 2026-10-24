"use strict";

const express = require("express");
const router = express.Router();

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

const {
  getBlocks,
  getBlockDependencies,
  createBlock,
  updateBlock,
  archiveBlock,
  restoreBlock,
  permanentDeleteBlock,
} = require("../../controllers/admin/blockController");

// ==========================================
// ADMIN AUTHENTICATION
// ==========================================

router.use(protect, authorizeRoles("ADMIN"));

// ==========================================
// GET BLOCKS
// ==========================================

router.get("/", getBlocks);

// ==========================================
// CREATE BLOCK
// ==========================================

router.post("/", createBlock);

// ==========================================
// CHECK BLOCK DEPENDENCIES
// ==========================================

router.get("/:id/dependencies", getBlockDependencies);

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
// PERMANENT DELETE
// ==========================================

router.delete("/:id/permanent", permanentDeleteBlock);

module.exports = router;
