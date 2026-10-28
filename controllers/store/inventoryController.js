const mongoose = require("mongoose");
const Inventory = require("../../models/Inventory");

// ==========================================
// HELPERS
// ==========================================

const validId = (id) => mongoose.isValidObjectId(id);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isNonNegative = (value) =>
  value !== "" &&
  value !== null &&
  value !== undefined &&
  Number.isFinite(Number(value)) &&
  Number(value) >= 0;

const clean = (value) => (typeof value === "string" ? value.trim() : "");

const handleError = (res, error) => {
  console.error("STORE INVENTORY ERROR:", error);

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "Item name or item code already exists",
    });
  }

  if (error.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  return res.status(500).json({
    success: false,
    message: "Inventory operation failed",
  });
};

// ==========================================
// CREATE INVENTORY ITEM
// ==========================================

const createInventoryItem = async (req, res) => {
  try {
    const {
      itemCode,
      itemName,
      itemDescription,
      category,
      otherCategory,
      quantity,
      currentStock,
      minimumStock,
      unit,
    } = req.body;

    const name = clean(itemName);
    const stock = quantity !== undefined ? quantity : currentStock;

    if (
      !name ||
      !clean(category) ||
      !clean(unit) ||
      !isNonNegative(stock) ||
      !isNonNegative(minimumStock ?? 5)
    ) {
      return res.status(400).json({
        success: false,
        message: "Item name, category, unit and valid quantities are required",
      });
    }

    const existing = await Inventory.findOne({
      itemName: {
        $regex: `^${escapeRegex(name)}$`,
        $options: "i",
      },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Inventory item already exists",
      });
    }

    const code = clean(itemCode).toUpperCase();

    if (code) {
      const existingCode = await Inventory.findOne({
        itemCode: code,
      });

      if (existingCode) {
        return res.status(409).json({
          success: false,
          message: "Item code already exists",
        });
      }
    }

    const data = {
      itemName: name,
      itemDescription: clean(itemDescription),
      category: clean(category),
      otherCategory: clean(otherCategory),
      currentStock: Number(stock),
      openingQuantity: Number(stock),
      incomingQuantity: 0,
      outgoingQuantity: 0,
      minimumStock: Number(minimumStock ?? 5),
      unit: clean(unit),
    };

    if (code) data.itemCode = code;

    const item = await Inventory.create(data);

    return res.status(201).json({
      success: true,
      message: "Inventory item created successfully",
      item,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// GET ALL INVENTORY ITEMS
// ==========================================

const getInventoryItems = async (req, res) => {
  try {
    const items = await Inventory.find().sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: items.length,
      items,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// GET SINGLE INVENTORY ITEM
// ==========================================

const getSingleInventoryItem = async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid inventory ID",
      });
    }

    const item = await Inventory.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Inventory item not found",
      });
    }

    return res.status(200).json({
      success: true,
      item,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// UPDATE INVENTORY ITEM
// ==========================================

const updateInventoryItem = async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid inventory ID",
      });
    }

    const item = await Inventory.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Inventory item not found",
      });
    }

    const {
      itemCode,
      itemName,
      itemDescription,
      category,
      otherCategory,
      minimumStock,
      unit,
      isActive,
    } = req.body;

    // Do not silently overwrite stock through
    // the metadata edit endpoint.
    if (
      req.body.currentStock !== undefined ||
      req.body.quantity !== undefined ||
      req.body.openingQuantity !== undefined ||
      req.body.incomingQuantity !== undefined ||
      req.body.outgoingQuantity !== undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Stock quantity cannot be edited here. Use the stock adjustment workflow.",
      });
    }

    if (itemName !== undefined) {
      const name = clean(itemName);

      if (!name) {
        return res.status(400).json({
          success: false,
          message: "Item name cannot be empty",
        });
      }

      const duplicate = await Inventory.findOne({
        _id: { $ne: item._id },
        itemName: {
          $regex: `^${escapeRegex(name)}$`,
          $options: "i",
        },
      });

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "Item name already exists",
        });
      }

      item.itemName = name;
    }

    if (itemCode !== undefined) {
      const code = clean(itemCode).toUpperCase();

      if (!code) {
        return res.status(400).json({
          success: false,
          message: "Item code cannot be empty",
        });
      }

      const duplicate = await Inventory.findOne({
        _id: { $ne: item._id },
        itemCode: code,
      });

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "Item code already exists",
        });
      }

      item.itemCode = code;
    }

    if (itemDescription !== undefined) {
      item.itemDescription = clean(itemDescription);
    }

    if (category !== undefined) {
      if (!clean(category)) {
        return res.status(400).json({
          success: false,
          message: "Category is required",
        });
      }

      item.category = clean(category);
    }

    if (otherCategory !== undefined) {
      item.otherCategory = clean(otherCategory);
    }

    if (unit !== undefined) {
      if (!clean(unit)) {
        return res.status(400).json({
          success: false,
          message: "Unit is required",
        });
      }

      item.unit = clean(unit);
    }

    if (minimumStock !== undefined) {
      if (!isNonNegative(minimumStock)) {
        return res.status(400).json({
          success: false,
          message: "Invalid minimum stock",
        });
      }

      item.minimumStock = Number(minimumStock);
    }

    if (isActive !== undefined) {
      if (typeof isActive !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "isActive must be true or false",
        });
      }

      item.isActive = isActive;
    }

    await item.save();

    return res.status(200).json({
      success: true,
      message: "Inventory updated successfully",
      item,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// DELETE INVENTORY ITEM
// ==========================================

const deleteInventoryItem = async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid inventory ID",
      });
    }

    // Soft delete: preserve references from
    // issue vouchers and inventory history.
    const item = await Inventory.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: false } },
      { new: true, runValidators: true },
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Inventory item not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Inventory item deactivated successfully",
      item,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// LEGACY DIRECT STOCK UPDATE
// ==========================================

// Direct editing has been intentionally disabled.
// Stock adjustments need an auditable ledger entry,
// reason and performedBy user.
//
// The proper inward/adjustment workflow will be
// implemented with StockTransaction and GRN models.

const updateStock = async (req, res) => {
  return res.status(409).json({
    success: false,
    message:
      "Direct stock replacement is disabled to protect stock history. Use the new Stock Inward / Adjustment workflow.",
  });
};

// ==========================================
// GET LOW STOCK ITEMS
// ==========================================

const getLowStockItems = async (req, res) => {
  try {
    const lowStockItems = await Inventory.find({
      isActive: { $ne: false },
      $expr: {
        $lte: ["$currentStock", "$minimumStock"],
      },
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: lowStockItems.length,
      lowStockItems,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  createInventoryItem,
  getInventoryItems,
  getSingleInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  updateStock,
  getLowStockItems,
};
