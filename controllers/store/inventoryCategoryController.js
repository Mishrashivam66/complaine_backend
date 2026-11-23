"use strict";

const mongoose = require("mongoose");
const Inventory = require("../../models/Inventory");

const SYSTEM_CATEGORIES = [
  "Electrical",
  "Plumbing",
  "Hardware",
  "Carpentry",
  "Civil",
  "Painting",
  "Sanitary",
  "Mechanical",
  "General Maintenance",
];

const clean = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");

const canonicalSystem = (name) =>
  SYSTEM_CATEGORIES.find(
    (item) => item.toLowerCase() === clean(name).toLowerCase(),
  );

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ==========================================
// CATEGORY DISPLAY NAME
// ==========================================

function normalizeCategory(record) {
  const category = clean(record.category);

  if (/^others?$/i.test(category)) {
    return clean(record.otherCategory) || "Other";
  }

  return category || "Uncategorized";
}

// ==========================================
// MATCH CUSTOM CATEGORY
// ==========================================
// Supports both legacy direct categories
// and "Other" + otherCategory records.
// ==========================================

function categoryQuery(name) {
  const rx = new RegExp(`^${escapeRegex(name)}$`, "i");

  return {
    $or: [
      {
        category: rx,
      },
      {
        category: /^others?$/i,
        otherCategory: rx,
      },
    ],
  };
}

// ==========================================
// VALIDATION
// ==========================================

function validateCustom(name, field) {
  const value = clean(name);

  if (value.length < 2 || value.length > 70 || /[<>\r\n]/.test(value)) {
    const error = new Error(`${field} must contain 2 to 70 valid characters.`);

    error.statusCode = 400;
    throw error;
  }

  if (/^(other|others|uncategorized)$/i.test(value)) {
    const error = new Error(`"${value}" cannot be used as a category name.`);

    error.statusCode = 400;
    throw error;
  }

  return value;
}

function errorResponse(res, error) {
  console.error("STORE CATEGORY MANAGEMENT:", error);

  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.statusCode ? error.message : "Category operation failed.",
  });
}

// ==========================================
// GET CATEGORY MANAGEMENT DATA
// ==========================================

exports.getCategoryManagement = async (_req, res) => {
  try {
    const inventory = await Inventory.find({})
      .select("category otherCategory isActive")
      .lean();

    const map = new Map();

    // System categories are permanent.
    for (const name of SYSTEM_CATEGORIES) {
      map.set(name.toLowerCase(), {
        name,
        materialCount: 0,
        isSystem: true,
      });
    }

    // Derive custom categories from Inventory.
    for (const item of inventory) {
      const name = normalizeCategory(item);

      if (name === "Other" || name === "Uncategorized") {
        continue;
      }

      const key = name.toLowerCase();

      const record = map.get(key) || {
        name,
        materialCount: 0,
        isSystem: Boolean(canonicalSystem(name)),
      };

      // Include inactive materials to prevent
      // deleting a category still referenced
      // by any inventory record.
      record.materialCount += 1;

      map.set(key, record);
    }

    const categories = [...map.values()].sort(
      (a, b) =>
        Number(b.isSystem) - Number(a.isSystem) || a.name.localeCompare(b.name),
    );

    return res.json({
      success: true,
      categories,
    });
  } catch (error) {
    return errorResponse(res, error);
  }
};

// ==========================================
// SHARED CATEGORY UPDATE
// ==========================================

async function moveCategory(req, res, remove = false) {
  let session;

  try {
    const oldName = validateCustom(req.body?.oldName, "Old category");

    const targetName = validateCustom(
      remove ? req.body?.replacementCategory : req.body?.newName,
      remove ? "Replacement category" : "New category",
    );

    // Never rename or delete system categories.
    if (canonicalSystem(oldName)) {
      const error = new Error(
        "System categories cannot be renamed or deleted.",
      );

      error.statusCode = 403;
      throw error;
    }

    if (
      oldName.toLowerCase() === targetName.toLowerCase() &&
      oldName === targetName
    ) {
      const error = new Error("Select a different category name.");

      error.statusCode = 400;
      throw error;
    }

    // Delete is actually a safe reassignment.
    // The destination must already exist.
    const existing = await Inventory.find({})
      .select("category otherCategory")
      .lean();

    const destinationExists =
      existing.some(
        (item) =>
          normalizeCategory(item).toLowerCase() === targetName.toLowerCase(),
      ) || Boolean(canonicalSystem(targetName));

    if (remove && !destinationExists) {
      const error = new Error("Replacement category must already exist.");

      error.statusCode = 400;
      throw error;
    }

    const canonicalTarget = canonicalSystem(targetName);

    const newFields = canonicalTarget
      ? {
          category: canonicalTarget,
          otherCategory: "",
        }
      : {
          category: "Other",
          otherCategory: targetName,
        };

    // ======================================
    // DATABASE TRANSACTION
    // ======================================

    session = await mongoose.startSession();

    let movedCount = 0;

    await session.withTransaction(async () => {
      const update = await Inventory.updateMany(
        categoryQuery(oldName),
        {
          $set: newFields,
        },
        {
          session,
        },
      );

      movedCount = update.matchedCount;

      if (!movedCount) {
        const error = new Error(
          "Category is no longer assigned to any inventory materials.",
        );

        error.statusCode = 404;
        throw error;
      }
    });

    return res.json({
      success: true,

      message: remove
        ? `Category removed. ${movedCount} material(s) reassigned to ${targetName}.`
        : `Category updated. ${movedCount} material(s) now use ${targetName}.`,

      updatedCount: movedCount,

      category: canonicalTarget || targetName,
    });
  } catch (error) {
    return errorResponse(res, error);
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}

// ==========================================
// RENAME CATEGORY
// ==========================================

exports.renameInventoryCategory = (req, res) => moveCategory(req, res, false);

// ==========================================
// DELETE CATEGORY WITH REASSIGNMENT
// ==========================================

exports.deleteInventoryCategory = (req, res) => moveCategory(req, res, true);
