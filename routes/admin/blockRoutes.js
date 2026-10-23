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

router.use(protect, authorizeRoles("ADMIN"));

router.get("/", getBlocks);
router.post("/", createBlock);
router.put("/:id", updateBlock);
router.delete("/:id", archiveBlock);
router.patch("/:id/restore", restoreBlock);

module.exports = router;
