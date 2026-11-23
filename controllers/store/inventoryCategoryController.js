"use strict";

const mongoose = require("mongoose");

const Inventory = require("../../models/Inventory");

const InventoryCategory = require("../../models/InventoryCategory");

// ==========================================
// HELPERS
// ==========================================

const clean = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");

const categoryKey = (value) => clean(value).toLowerCase();

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function validateName(value) {
  const name = clean(value);

  if (
    name.length < 2 ||
    name.length > 70 ||
    /[<>\r\n]/.test(name) ||
    /^(other|others|uncategorized)$/i.test(name)
  ) {
    fail(
      'Category name must be 2–70 characters and cannot be "Other" or "Uncategorized".',
    );
  }

  return name;
}

// Supports older inventory categories and
// custom categories stored as:
//
// category: "Other"
// otherCategory: "Electrical"

function inventoryCategoryFilter(name) {
  const exact = new RegExp(`^${escapeRegex(name)}$`, "i");

  return {
    $or: [
      {
        category: exact,
      },
      {
        category: /^others?$/i,
        otherCategory: exact,
      },
    ],
  };
}

function errorResponse(res, error) {
  console.error("INVENTORY CATEGORY ERROR:", error);

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "A category with this name already exists.",
    });
  }

  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.statusCode ? error.message : "Category operation failed.",
  });
}

// ==========================================
// GET CATEGORY MANAGEMENT
// GET /api/store/inventory/category-management
// ==========================================

exports.getCategoryManagement = async (_req, res) => {
  try {
    // ONLY categories created in Category Master.
    // No defaults.
    // No automatic old Excel categories.

    const masters = await InventoryCategory.find({})
      .sort({ name: 1 })
      .select("name createdAt")
      .lean();

    const categories = await Promise.all(
      masters.map(async (record) => ({
        _id: record._id,

        name: record.name,

        isSystem: false,

        materialCount: await Inventory.countDocuments(
          inventoryCategoryFilter(record.name),
        ),

        createdAt: record.createdAt,
      })),
    );

    return res.status(200).json({
      success: true,

      source: "CATEGORY_MASTER",

      categories,
    });
  } catch (error) {
    return errorResponse(res, error);
  }
};

// ==========================================
// GET CATEGORY NAMES
// GET /api/store/inventory/categories
// ==========================================

exports.getInventoryCategories = async (_req, res) => {
  try {
    const records = await InventoryCategory.find({})
      .sort({ name: 1 })
      .select("name")
      .lean();

    return res.json({
      success: true,

      source: "CATEGORY_MASTER",

      categories: records.map((record) => record.name),
    });
  } catch (error) {
    return errorResponse(res, error);
  }
};

// ==========================================
// CREATE CATEGORY
// POST /api/store/inventory/categories
// ==========================================

exports.createInventoryCategory = async (req, res) => {
  try {
    const name = validateName(req.body?.name);

    const nameKey = categoryKey(name);

    const alreadyExists = await InventoryCategory.exists({
      nameKey,
    });

    if (alreadyExists) {
      fail("Category already exists.", 409);
    }

    const category = await InventoryCategory.create({
      name,

      nameKey,

      createdBy: req.user?._id || null,

      updatedBy: req.user?._id || null,
    });

    return res.status(201).json({
      success: true,

      message: `Category "${name}" created successfully.`,

      category: {
        _id: category._id,

        name: category.name,

        isSystem: false,

        materialCount: 0,
      },
    });
  } catch (error) {
    return errorResponse(res, error);
  }
};

// ==========================================
// RENAME CATEGORY
// PUT /api/store/inventory/categories/rename
// ==========================================

exports.renameInventoryCategory = async (req, res) => {
  let session;

  try {
    const oldName = validateName(req.body?.oldName);

    const newName = validateName(req.body?.newName);

    const oldKey = categoryKey(oldName);
    const newKey = categoryKey(newName);

    if (oldName === newName) {
      fail("Enter a different category name.");
    }

    session = await mongoose.startSession();

    let updatedCount = 0;

    await session.withTransaction(async () => {
      const oldCategory = await InventoryCategory.findOne({
        nameKey: oldKey,
      }).session(session);

      if (!oldCategory) {
        fail("Category not found in Category Master.", 404);
      }

      if (oldKey !== newKey) {
        const conflict = await InventoryCategory.exists({
          nameKey: newKey,
        }).session(session);

        if (conflict) {
          fail("Category name already exists.", 409);
        }
      }

      // Rename all linked inventory items.
      // Stock quantities are not changed.

      const result = await Inventory.updateMany(
        inventoryCategoryFilter(oldCategory.name),

        {
          $set: {
            category: "Other",
            otherCategory: newName,
          },
        },

        {
          session,
          runValidators: true,
        },
      );

      updatedCount = result.matchedCount ?? result.n ?? 0;

      oldCategory.name = newName;
      oldCategory.nameKey = newKey;

      oldCategory.updatedBy = req.user?._id || null;

      await oldCategory.save({
        session,
      });
    });

    return res.json({
      success: true,

      message:
        `Category renamed to "${newName}". ` +
        `${updatedCount} material(s) updated.`,

      category: newName,

      updatedCount,
    });
  } catch (error) {
    return errorResponse(res, error);
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};

// ==========================================
// DELETE CATEGORY
// DELETE /api/store/inventory/categories/delete
// ==========================================

exports.deleteInventoryCategory = async (req, res) => {
  let session;

  try {
    const oldName = validateName(req.body?.oldName);

    const replacementInput = clean(req.body?.replacementCategory);

    const oldKey = categoryKey(oldName);

    session = await mongoose.startSession();

    let movedCount = 0;

    await session.withTransaction(async () => {
      const oldCategory = await InventoryCategory.findOne({
        nameKey: oldKey,
      }).session(session);

      if (!oldCategory) {
        fail("Category not found in Category Master.", 404);
      }

      const filter = inventoryCategoryFilter(oldCategory.name);

      const linkedCount =
        await Inventory.countDocuments(filter).session(session);

      // If category has materials,
      // move them to another saved category.

      if (linkedCount > 0) {
        const replacementName = validateName(replacementInput);

        if (categoryKey(replacementName) === oldKey) {
          fail("Choose a different replacement category.");
        }

        const replacement = await InventoryCategory.findOne({
          nameKey: categoryKey(replacementName),
        }).session(session);

        if (!replacement) {
          fail(
            "Choose an existing Store Manager-created replacement category.",
          );
        }

        const update = await Inventory.updateMany(
          filter,

          {
            $set: {
              category: "Other",

              otherCategory: replacement.name,
            },
          },

          {
            session,
            runValidators: true,
          },
        );

        movedCount = update.matchedCount ?? update.n ?? 0;
      }

      // Remove only Category Master record.
      // Never delete inventory or stock history.

      await InventoryCategory.deleteOne({
        _id: oldCategory._id,
      }).session(session);
    });

    return res.json({
      success: true,

      message:
        movedCount > 0
          ? `Category removed. ${movedCount} material(s) safely reassigned.`
          : "Empty category removed successfully.",

      updatedCount: movedCount,
    });
  } catch (error) {
    return errorResponse(res, error);
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};
