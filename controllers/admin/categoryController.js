"use strict";

const mongoose = require("mongoose");
const Category = require("../../models/Category");
const Complaint = require("../../models/Complaint");

const FINISHED = ["COMPLETED", "RESOLVED", "CLOSED"];
const PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH"]);

const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const nameRegex = (name) =>
  new RegExp(`^\\s*${escapeRegExp(name.trim())}\\s*$`, "i");

// ==========================================
// INPUT AND ERROR HELPERS
// ==========================================

function inputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function handleError(res, error) {
  if (error?.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "A category with this name already exists",
    });
  }

  if (
    error?.statusCode ||
    ["CastError", "ValidationError"].includes(error?.name)
  ) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.statusCode ? error.message : "Invalid category details",
    });
  }

  console.error("CATEGORY MANAGEMENT ERROR:", error);

  return res.status(500).json({
    success: false,
    message: "Category operation failed",
  });
}

// ==========================================
// VALIDATE CATEGORY INPUT
// ==========================================

function validate(body = {}, { creating = false } = {}) {
  const values = {};

  if (creating || body.categoryName !== undefined) {
    if (
      typeof body.categoryName !== "string" ||
      !body.categoryName.trim() ||
      body.categoryName.trim().length > 120
    ) {
      throw inputError("Category name is required (maximum 120 characters)");
    }

    values.categoryName = body.categoryName.trim();
  }

  if (body.department !== undefined && body.department !== "MAINTENANCE") {
    throw inputError("AmiMaintain supports maintenance categories only");
  }

  if (body.priority !== undefined) {
    if (!PRIORITIES.has(body.priority)) {
      throw inputError("Priority must be LOW, MEDIUM or HIGH");
    }

    values.priority = body.priority;
  }

  for (const [field, maximum] of [
    ["icon", 60],
    ["description", 1000],
  ]) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "string" || body[field].length > maximum) {
        throw inputError(
          `${field} must be text (maximum ${maximum} characters)`,
        );
      }

      values[field] = body[field].trim();
    }
  }

  if (body.subCategories !== undefined) {
    if (!Array.isArray(body.subCategories)) {
      throw inputError("Subcategories must be a list");
    }

    if (body.subCategories.length > 100) {
      throw inputError("Maximum 100 subcategories allowed");
    }

    if (
      body.subCategories.some(
        (item) => typeof item !== "string" || item.trim().length > 120,
      )
    ) {
      throw inputError("Invalid subcategory name (maximum 120 characters)");
    }

    const names = body.subCategories.map((item) => item.trim()).filter(Boolean);

    if (
      new Set(names.map((item) => item.toLowerCase())).size !== names.length
    ) {
      throw inputError("Duplicate subcategories are not allowed");
    }

    values.subCategories = names;
  }

  return values;
}

// ==========================================
// FIND CATEGORY
// ==========================================

async function getById(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({
      success: false,
      message: "Invalid category ID",
    });

    return null;
  }

  const category = await Category.findOne({
    _id: req.params.id,
    department: "MAINTENANCE",
  });

  if (!category) {
    res.status(404).json({
      success: false,
      message: "Maintenance category not found",
    });
  }

  return category;
}

// ==========================================
// DUPLICATE CATEGORY NAME
// ==========================================

async function duplicateName(name, excludedId = null) {
  return Category.exists({
    categoryName: nameRegex(name),

    ...(excludedId ? { _id: { $ne: excludedId } } : {}),
  });
}

// ==========================================
// LIVE DEPENDENCY REPORT
// ==========================================

async function dependencyReport(category, { checkExtra = false } = {}) {
  const matchingCategory = nameRegex(category.categoryName);

  const matching = {
    category: matchingCategory,
  };

  const [complaintCount, openComplaintCount] = await Promise.all([
    Complaint.countDocuments(matching),

    Complaint.countDocuments({
      ...matching,
      status: { $nin: FINISHED },
    }),
  ]);

  const report = {
    categoryName: category.categoryName,
    complaintCount,
    openComplaintCount,
    otherReferences: [],
    fullyChecked: false,
  };

  if (!checkExtra) {
    return report;
  }

  // Check known maintenance collections using
  // explicit category reference fields.
  // Unrelated matching names are not considered.

  const database = mongoose.connection.db;

  if (!database) {
    throw new Error("Database unavailable");
  }

  const knownCollections = new Set([
    "maintenancetasks",
    "maintenancehistories",
    "jobcards",
    "preventivemaintenances",
    "workorders",
  ]);

  const available = await database
    .listCollections({}, { nameOnly: true })
    .toArray();

  for (const { name } of available) {
    if (!knownCollections.has(name.toLowerCase())) {
      continue;
    }

    const reference = await database.collection(name).findOne(
      {
        $or: [
          { category: matchingCategory },
          { categoryName: matchingCategory },
          { complaintCategory: matchingCategory },
          { categoryId: category._id },
          { categoryRef: category._id },
        ],
      },
      {
        projection: { _id: 1 },
      },
    );

    if (reference) {
      report.otherReferences.push(name);
    }
  }

  report.fullyChecked = true;

  return report;
}

// ==========================================
// LIVE COMPLAINT COUNT
// ==========================================

async function categoryWithCount(category) {
  const dependencies = await dependencyReport(category);

  return {
    ...category,

    totalComplaints: dependencies.complaintCount,

    openComplaintCount: dependencies.openComplaintCount,
  };
}

// ==========================================
// GET ALL MAINTENANCE CATEGORIES
// ==========================================

exports.getCategories = async (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === "true";

    const filter = {
      department: "MAINTENANCE",

      ...(includeArchived
        ? {}
        : {
            isDeleted: { $ne: true },
          }),
    };

    const rows = await Category.find(filter).sort({ categoryName: 1 }).lean();

    const categories = await Promise.all(rows.map(categoryWithCount));

    return res.json({
      success: true,
      total: categories.length,
      categories,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// ACTIVE CATEGORIES FOR OTHER PORTALS
// ==========================================

exports.getActiveCategories = async (req, res) => {
  try {
    const categories = await Category.find({
      department: "MAINTENANCE",
      isActive: { $ne: false },
      isDeleted: { $ne: true },
    })
      .select("categoryName department priority icon description subCategories")
      .sort({ categoryName: 1 })
      .lean();

    return res.json({
      success: true,
      total: categories.length,
      categories,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// GET CATEGORY DEPENDENCIES
// ==========================================

exports.getCategoryDependencies = async (req, res) => {
  try {
    const category = await getById(req, res);

    if (!category) return;

    const dependencies = await dependencyReport(category, { checkExtra: true });

    return res.json({
      success: true,
      dependencies,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// CREATE CATEGORY
// ==========================================

exports.createCategory = async (req, res) => {
  try {
    const fields = validate(req.body || {}, { creating: true });

    if (await duplicateName(fields.categoryName)) {
      return res.status(409).json({
        success: false,
        message: "Category already exists",
      });
    }

    const category = await Category.create({
      ...fields,
      department: "MAINTENANCE",
      isActive: true,
      isDeleted: false,
    });

    return res.status(201).json({
      success: true,
      message: "Category created successfully",
      category,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// UPDATE CATEGORY
// ==========================================

exports.updateCategory = async (req, res) => {
  try {
    const category = await getById(req, res);

    if (!category) return;

    if (category.isDeleted) {
      return res.status(409).json({
        success: false,
        message: "Restore this category before editing",
      });
    }

    const fields = validate(req.body || {});

    if (
      fields.categoryName &&
      fields.categoryName.toLowerCase() !== category.categoryName.toLowerCase()
    ) {
      const dependency = await dependencyReport(category, { checkExtra: true });

      if (dependency.complaintCount || dependency.otherReferences.length) {
        return res.status(409).json({
          success: false,
          message:
            "Category is used by existing records; keep its name or migrate references first",
          dependencies: dependency,
        });
      }

      if (await duplicateName(fields.categoryName, category._id)) {
        return res.status(409).json({
          success: false,
          message: "Category name already exists",
        });
      }
    }

    Object.assign(category, fields);

    await category.save();

    return res.json({
      success: true,
      message: "Category updated",
      category,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// ACTIVATE / DEACTIVATE
// ==========================================

exports.toggleCategoryStatus = async (req, res) => {
  try {
    const category = await getById(req, res);

    if (!category) return;

    if (category.isDeleted) {
      return res.status(409).json({
        success: false,
        message: "Restore the category before changing status",
      });
    }

    category.isActive = !category.isActive;

    await category.save();

    return res.json({
      success: true,

      message: category.isActive
        ? "Category activated"
        : "Category deactivated",

      category,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// ARCHIVE CATEGORY
// LEGACY DELETE URL
// ==========================================

exports.deleteCategory = async (req, res) => {
  try {
    const category = await getById(req, res);

    if (!category) return;

    if (category.isDeleted) {
      return res.status(409).json({
        success: false,
        message: "Category already archived",
      });
    }

    category.isActive = false;
    category.isDeleted = true;

    await category.save();

    return res.json({
      success: true,

      message: "Category archived; complaint history preserved",

      category,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// RESTORE CATEGORY
// ==========================================

exports.restoreCategory = async (req, res) => {
  try {
    const category = await getById(req, res);

    if (!category) return;

    if (!category.isDeleted) {
      return res.json({
        success: true,
        message: "Category is already available",
        category,
      });
    }

    category.isDeleted = false;
    category.isActive = true;

    await category.save();

    return res.json({
      success: true,
      message: "Category restored",
      category,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// PERMANENT DELETE
// ==========================================

exports.permanentDeleteCategory = async (req, res) => {
  try {
    const category = await getById(req, res);

    if (!category) return;

    if (!category.isDeleted) {
      return res.status(409).json({
        success: false,
        message: "Archive this category before permanent deletion",
      });
    }

    const report = await dependencyReport(category, { checkExtra: true });

    if (report.complaintCount || report.otherReferences.length) {
      return res.status(409).json({
        success: false,

        message: "Category has linked complaint/work records; keep it archived",

        dependencies: report,
      });
    }

    const result = await Category.deleteOne({
      _id: category._id,
      isDeleted: true,
    });

    if (!result.deletedCount) {
      return res.status(409).json({
        success: false,
        message: "Category changed; refresh first",
      });
    }

    return res.json({
      success: true,

      message: "Unreferenced category permanently deleted",
    });
  } catch (error) {
    return handleError(res, error);
  }
};
