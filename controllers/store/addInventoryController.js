"use strict";

const crypto = require("crypto");
const Inventory = require("../../models/Inventory");
const inventoryController = require("./inventoryController");

const clean = (value) => String(value ?? "").trim();

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const DEFAULT_CATEGORIES = [
  "Electrical",
  "Plumbing",
  "Hardware",
  "Carpentry",
  "Civil",
  "Painting",
  "Sanitary",
  "Mechanical",
  "General Maintenance",
  "Other",
];

// ==========================================
// ADD MATERIAL TO INVENTORY MASTER
// ==========================================
// New master items start with ZERO stock.
// Physical stock is received through GRN.
// ==========================================

exports.addInventory = async (req, res) => {
  try {
    const body = req.body || {};

    const itemName = clean(body.itemName);
    const requestedCategory = clean(body.category);
    const unit = clean(body.unit) || "Nos";

    if (!itemName) {
      return res.status(400).json({
        success: false,
        message: "Material name is required.",
      });
    }

    if (!requestedCategory) {
      return res.status(400).json({
        success: false,
        message: "Please select a material category.",
      });
    }

    const isOther = requestedCategory.toLowerCase() === "other";

    const category = isOther ? "Other" : requestedCategory;

    const otherCategory = isOther ? clean(body.otherCategory) : "";

    if (isOther && !otherCategory) {
      return res.status(400).json({
        success: false,
        message: "Please enter the custom category name.",
      });
    }

    // No direct addition of physical stock.
    const requestedQuantity = body.quantity ?? body.currentStock ?? 0;

    const quantity = Number(requestedQuantity);

    if (!Number.isFinite(quantity) || quantity !== 0) {
      return res.status(400).json({
        success: false,
        message:
          "New material must start with zero stock. " +
          "Use Stock Inward to receive physical materials.",
      });
    }

    const minimumStock = Number(body.minimumStock ?? 5);

    if (
      !Number.isFinite(minimumStock) ||
      minimumStock < 0 ||
      Math.abs(minimumStock * 1000 - Math.round(minimumStock * 1000)) > 1e-7
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Minimum stock must be a valid non-negative quantity with up to three decimal places.",
      });
    }

    // Case-insensitive duplicate name check.
    const existingName = await Inventory.findOne({
      itemName: {
        $regex: `^${escapeRegex(itemName)}$`,
        $options: "i",
      },
    }).select("_id");

    if (existingName) {
      return res.status(409).json({
        success: false,
        message:
          "Material already exists. Use Stock Inward to increase its quantity.",
      });
    }

    // Generate a unique-looking Item Code if absent.
    // The database unique index remains authoritative.
    const itemCode =
      clean(body.itemCode).toUpperCase() ||
      `AMI-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;

    // Forward validated master data to the
    // existing central inventory controller.
    req.body = {
      itemCode,
      itemName,
      itemDescription: clean(body.itemDescription),
      category,
      otherCategory,
      unit,
      quantity: 0,
      currentStock: 0,
      minimumStock,
    };

    return await inventoryController.createInventoryItem(req, res);
  } catch (error) {
    console.error("ADD INVENTORY ERROR:", error);

    if (res.headersSent) {
      return;
    }

    return res.status(500).json({
      success: false,
      message: "Unable to create inventory material.",
    });
  }
};

// ==========================================
// DYNAMIC MATERIAL CATEGORIES
// ==========================================

exports.getInventoryCategories = async (_req, res) => {
  try {
    const rows = await Inventory.find({})
      .select("category otherCategory")
      .lean();

    const names = new Set(DEFAULT_CATEGORIES);

    for (const row of rows) {
      const cat = clean(row.category);

      if (!cat) continue;

      if (cat.toLowerCase() === "other") {
        const custom = clean(row.otherCategory);

        if (custom) {
          names.add(custom);
        }
      } else {
        names.add(cat);
      }
    }

    const categories = [...names]
      .filter((value) => value !== "Other")
      .sort((a, b) => a.localeCompare(b));

    categories.push("Other");

    return res.status(200).json({
      success: true,
      categories,
    });
  } catch (error) {
    console.error("CATEGORY FETCH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load material categories.",
    });
  }
};

// ==========================================
// PRESERVE LEGACY INVENTORY OPERATIONS
// ==========================================

exports.getAllInventory = inventoryController.getInventoryItems;

exports.getSingleInventory = inventoryController.getSingleInventoryItem;

exports.updateInventory = inventoryController.updateInventoryItem;

exports.deleteInventory = inventoryController.deleteInventoryItem;

exports.getLowStockItems = inventoryController.getLowStockItems;
