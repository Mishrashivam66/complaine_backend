"use strict";

const Block = require("../../models/Block");
const User = require("../../models/User");

const validCode = (value) =>
  typeof value === "string" &&
  /^[A-Z0-9][A-Z0-9_-]{0,11}$/.test(value.trim().toUpperCase());

exports.getBlocks = async (req, res) => {
  try {
    const blocks = await Block.find({
      isDeleted: { $ne: true },
    })
      .sort({ code: 1 })
      .select("code name description isActive createdAt updatedAt")
      .lean();

    return res.json({
      success: true,
      blocks,
    });
  } catch (error) {
    console.error("GET BLOCKS:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load blocks",
    });
  }
};

exports.createBlock = async (req, res) => {
  try {
    const { code, name, description } = req.body || {};

    if (!validCode(code) || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Valid block code and name required",
      });
    }

    const block = await Block.create({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      description: typeof description === "string" ? description.trim() : "",
    });

    return res.status(201).json({
      success: true,
      block,
      message: "Block created",
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Block code already exists",
      });
    }

    if (error?.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Invalid block data",
      });
    }

    console.error("CREATE BLOCK:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create block",
    });
  }
};

exports.updateBlock = async (req, res) => {
  try {
    const block = await Block.findById(req.params.id);

    if (!block || block.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Block not found",
      });
    }

    // Keep codes stable for existing references.
    if (req.body?.code && req.body.code.trim().toUpperCase() !== block.code) {
      return res.status(400).json({
        success: false,
        message: "Block code cannot be changed after creation",
      });
    }

    if (typeof req.body?.name === "string" && req.body.name.trim()) {
      block.name = req.body.name.trim();
    }

    if (typeof req.body?.description === "string") {
      block.description = req.body.description.trim();
    }

    if (typeof req.body?.isActive === "boolean") {
      if (!req.body.isActive) {
        const assigned = await User.exists({
          role: "BLOCK_ADMIN",
          assignedBlock: block.code,
          isActive: true,
          isDeleted: { $ne: true },
        });

        if (assigned) {
          return res.status(409).json({
            success: false,
            message:
              "Reassign active Block Admins before deactivating this block",
          });
        }
      }

      block.isActive = req.body.isActive;
    }

    await block.save();

    return res.json({
      success: true,
      block,
      message: "Block updated",
    });
  } catch (error) {
    if (error?.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid block ID",
      });
    }

    console.error("UPDATE BLOCK:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update block",
    });
  }
};
