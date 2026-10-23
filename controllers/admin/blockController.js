"use strict";

const mongoose = require("mongoose");
const Block = require("../../models/Block");
const User = require("../../models/User");

const FLOORS = [
  "Ground",
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
  "Eighth",
];

const handleError = (res, error) => {
  if (error?.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "Academic Block code already exists",
    });
  }

  if (["ValidationError", "CastError"].includes(error?.name)) {
    return res.status(400).json({
      success: false,
      message: "Invalid Academic Block data",
    });
  }

  console.error("ACADEMIC BLOCK:", error);

  return res.status(500).json({
    success: false,
    message: "Academic Block operation failed",
  });
};

const validateFields = (body, creating = false) => {
  const result = {};

  if (creating || body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      throw new Error("Block name is required");
    }

    result.name = body.name.trim();
  }

  for (const key of ["buildingType", "roomRange", "description"]) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "string") {
        throw new Error(`${key} must be text`);
      }

      result[key] = body[key].trim();
    }
  }

  for (const key of ["startFloor", "endFloor"]) {
    if (body[key] !== undefined) {
      if (!FLOORS.includes(body[key])) {
        throw new Error("Invalid floor selection");
      }

      result[key] = body[key];
    }
  }

  if (body.departments !== undefined) {
    if (!Array.isArray(body.departments)) {
      throw new Error("Departments must be a list");
    }

    if (body.departments.some((item) => typeof item !== "string")) {
      throw new Error("Invalid department name");
    }

    const departments = body.departments
      .map((item) => item.trim())
      .filter(Boolean);

    if (
      departments.length > 100 ||
      departments.some((name) => name.length > 120)
    ) {
      throw new Error("Invalid department list");
    }

    const names = departments.map((name) => name.toLowerCase());

    if (new Set(names).size !== names.length) {
      throw new Error("Duplicate department name");
    }

    result.departments = departments;
  }

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      throw new Error("Invalid active status");
    }

    result.isActive = body.isActive;
  }

  return result;
};

const hasAssignedAdmin = async (code) => {
  return Boolean(
    await User.exists({
      role: "BLOCK_ADMIN",
      assignedBlock: code,
      isActive: true,
      isDeleted: { $ne: true },
    }),
  );
};

const findBlock = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({
      success: false,
      message: "Invalid block ID",
    });

    return null;
  }

  const block = await Block.findById(req.params.id);

  if (!block) {
    res.status(404).json({
      success: false,
      message: "Academic Block not found",
    });

    return null;
  }

  return block;
};

// ==========================================
// GET BLOCKS
// ==========================================

exports.getBlocks = async (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === "true";

    const query = includeArchived
      ? {}
      : {
          isActive: true,
          isDeleted: { $ne: true },
        };

    const blocks = await Block.find(query).sort({ code: 1 }).lean();

    return res.json({
      success: true,
      blocks,
    });
  } catch (error) {
    return handleError(res, error);
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

    if (!/^[A-Z0-9][A-Z0-9_-]{0,11}$/.test(code)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid unique Block Code",
      });
    }

    const payload = validateFields(req.body || {}, true);

    const start = FLOORS.indexOf(payload.startFloor || "Ground");

    const end = FLOORS.indexOf(payload.endFloor || "Fourth");

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: "End floor must not be before start floor",
      });
    }

    const block = await Block.create({
      code,
      ...payload,
      isActive: true,
      isDeleted: false,
    });

    return res.status(201).json({
      success: true,
      message: "Academic Block created",
      block,
    });
  } catch (error) {
    if (
      error.message &&
      !["ValidationError", "CastError"].includes(error.name) &&
      error.code !== 11000
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return handleError(res, error);
  }
};

// ==========================================
// UPDATE BLOCK
// ==========================================

exports.updateBlock = async (req, res) => {
  try {
    const block = await findBlock(req, res);

    if (!block) return;

    if (block.isDeleted) {
      return res.status(409).json({
        success: false,
        message: "Restore this block before editing",
      });
    }

    if (
      req.body?.code !== undefined &&
      String(req.body.code).trim().toUpperCase() !== block.code
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Block Code is permanent. Archive and create a new block if necessary.",
      });
    }

    const changes = validateFields(req.body || {});

    const start = FLOORS.indexOf(changes.startFloor || block.startFloor);

    const end = FLOORS.indexOf(changes.endFloor || block.endFloor);

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: "End floor must not be before start floor",
      });
    }

    if (changes.isActive === false && (await hasAssignedAdmin(block.code))) {
      return res.status(409).json({
        success: false,
        message: "Reassign active Block Admin before deactivating",
      });
    }

    Object.assign(block, changes);

    await block.save();

    return res.json({
      success: true,
      message: "Academic Block updated",
      block,
    });
  } catch (error) {
    if (
      error.message &&
      !["ValidationError", "CastError"].includes(error.name)
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return handleError(res, error);
  }
};

// ==========================================
// ARCHIVE BLOCK
// ==========================================

exports.archiveBlock = async (req, res) => {
  try {
    const block = await findBlock(req, res);

    if (!block) return;

    if (await hasAssignedAdmin(block.code)) {
      return res.status(409).json({
        success: false,
        message: "Reassign active Block Admin before archiving",
      });
    }

    block.isDeleted = true;
    block.isActive = false;

    await block.save();

    return res.json({
      success: true,
      message: "Block archived; complaint history preserved",
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// RESTORE BLOCK
// ==========================================

exports.restoreBlock = async (req, res) => {
  try {
    const block = await findBlock(req, res);

    if (!block) return;

    block.isDeleted = false;
    block.isActive = true;

    await block.save();

    return res.json({
      success: true,
      message: "Academic Block restored",
      block,
    });
  } catch (error) {
    return handleError(res, error);
  }
};
