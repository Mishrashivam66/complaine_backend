"use strict";

const mongoose = require("mongoose");

const Block = require("../../models/Block");
const User = require("../../models/User");

// ==========================================
// BLOCK ADMIN ASSIGNMENT CHECK
// ==========================================

const assignedBlockAdminQuery = (code) => ({
  role: "BLOCK_ADMIN",
  assignedBlock: code,
  isDeleted: { $ne: true },
});

// ==========================================
// ERROR HANDLER
// ==========================================

const handleError = (res, error, message) => {
  if (error?.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "Block code already exists",
    });
  }

  if (error?.name === "CastError" || error?.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: "Invalid block data",
    });
  }

  console.error(message, error);

  return res.status(500).json({
    success: false,
    message,
  });
};

// ==========================================
// GET BLOCKS
// ==========================================

exports.getBlocks = async (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === "true";

    const filter = includeArchived ? {} : { isDeleted: { $ne: true } };

    const blocks = await Block.find(filter)
      .select("code name description isActive isDeleted createdAt updatedAt")
      .sort({ code: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      blocks,
    });
  } catch (error) {
    return handleError(res, error, "Unable to load blocks");
  }
};

// ==========================================
// CREATE BLOCK
// ==========================================

exports.createBlock = async (req, res) => {
  try {
    const code = String(req.body?.code || "")
      .trim()
      .toUpperCase();

    const name = String(req.body?.name || "").trim();

    const description = String(req.body?.description || "").trim();

    if (
      !/^[A-Z0-9][A-Z0-9_-]{0,11}$/.test(code) ||
      !name ||
      name.length > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid block code and name required",
      });
    }

    const block = await Block.create({
      code,
      name,
      description,
      isActive: true,
      isDeleted: false,
    });

    return res.status(201).json({
      success: true,
      message: "Block created",
      block,
    });
  } catch (error) {
    return handleError(res, error, "Unable to create block");
  }
};

// ==========================================
// UPDATE BLOCK
// ==========================================

exports.updateBlock = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid block ID",
      });
    }

    const block = await Block.findById(req.params.id);

    if (!block || block.isDeleted === true) {
      return res.status(404).json({
        success: false,
        message: "Block not found",
      });
    }

    // Block code is an identifier used in
    // existing accounts and complaints.

    if (
      req.body?.code &&
      String(req.body.code).trim().toUpperCase() !== block.code
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Block code cannot be changed. Archive and create a correct block if the code was entered incorrectly.",
      });
    }

    if (req.body?.name !== undefined) {
      if (typeof req.body.name !== "string" || !req.body.name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Valid name is required",
        });
      }

      block.name = req.body.name.trim();
    }

    if (req.body?.description !== undefined) {
      block.description = String(req.body.description).trim();
    }

    // ======================================
    // ACTIVE / INACTIVE
    // ======================================

    if (typeof req.body?.isActive === "boolean") {
      if (req.body.isActive === false) {
        const assigned = await User.exists(assignedBlockAdminQuery(block.code));

        if (assigned) {
          return res.status(409).json({
            success: false,
            message:
              "Reassign Block Admin accounts before deactivating this block",
          });
        }
      }

      block.isActive = req.body.isActive;
    }

    await block.save();

    return res.status(200).json({
      success: true,
      message: "Block updated",
      block,
    });
  } catch (error) {
    return handleError(res, error, "Unable to update block");
  }
};

// ==========================================
// ARCHIVE BLOCK
// ==========================================

exports.archiveBlock = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid block ID",
      });
    }

    const block = await Block.findById(req.params.id);

    if (!block || block.isDeleted === true) {
      return res.status(404).json({
        success: false,
        message: "Block not found",
      });
    }

    // Do not archive a block currently
    // assigned to non-archived Block Admins.

    const assigned = await User.exists(assignedBlockAdminQuery(block.code));

    if (assigned) {
      return res.status(409).json({
        success: false,
        message: "Reassign Block Admin accounts before archiving this block",
      });
    }

    block.isDeleted = true;
    block.isActive = false;

    await block.save();

    return res.status(200).json({
      success: true,
      message: "Block archived; historical records preserved",
    });
  } catch (error) {
    return handleError(res, error, "Unable to archive block");
  }
};

// ==========================================
// RESTORE BLOCK
// ==========================================

exports.restoreBlock = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid block ID",
      });
    }

    const block = await Block.findById(req.params.id);

    if (!block) {
      return res.status(404).json({
        success: false,
        message: "Block not found",
      });
    }

    block.isDeleted = false;
    block.isActive = true;

    await block.save();

    return res.status(200).json({
      success: true,
      message: "Block restored",
      block,
    });
  } catch (error) {
    return handleError(res, error, "Unable to restore block");
  }
};
