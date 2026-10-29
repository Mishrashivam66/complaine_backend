const mongoose = require("mongoose");
const Inventory = require("../../models/Inventory");

// ==========================================
// HELPERS
// ==========================================

const validId = (id) => mongoose.isValidObjectId(id);

const clean = (value) => (typeof value === "string" ? value.trim() : "");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isNonNegative = (value) =>
  value !== "" &&
  value !== null &&
  value !== undefined &&
  Number.isFinite(Number(value)) &&
  Number(value) >= 0;

const stockStatus = (stock, minimum) => {
  const current = Number(stock || 0);
  const min = Number(minimum || 0);

  if (current <= 0) return "Out Of Stock";
  if (current <= min) return "Low Stock";
  return "Available";
};

const handleError = (res, error) => {
  console.error("STORE INVENTORY ERROR:", error);

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "Item name or item code already exists",
    });
  }

  if (error.name === "ValidationError" || error.name === "CastError") {
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
// FORMAT INVENTORY RESPONSE
// ==========================================

const formatInventory = (item) => {
  const data =
    typeof item.toObject === "function" ? item.toObject() : { ...item };

  return {
    ...data,

    itemCode: clean(data.itemCode).toUpperCase(),

    itemDescription: clean(data.itemDescription) || clean(data.itemName),

    openingQuantity: data.openingQuantity ?? null,

    incomingQuantity: Number(data.incomingQuantity ?? 0),

    outgoingQuantity: Number(data.outgoingQuantity ?? 0),

    currentStock: Number(data.currentStock ?? 0),

    minimumStock: Number(data.minimumStock ?? 5),

    status: stockStatus(data.currentStock, data.minimumStock),
  };
};

// ==========================================
// CREATE INVENTORY ITEM
// POST /api/store/inventory
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
    const code = clean(itemCode).toUpperCase();

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

    const existingName = await Inventory.findOne({
      itemName: {
        $regex: `^${escapeRegex(name)}$`,
        $options: "i",
      },
    });

    if (existingName) {
      return res.status(409).json({
        success: false,
        message: "Inventory item already exists",
      });
    }

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
      unit: clean(unit),
      currentStock: Number(stock),
      openingQuantity: Number(stock),
      incomingQuantity: 0,
      outgoingQuantity: 0,
      minimumStock: Number(minimumStock ?? 5),
    };

    if (code) data.itemCode = code;

    const item = await Inventory.create(data);

    return res.status(201).json({
      success: true,
      message: "Inventory item created successfully",
      item: formatInventory(item),
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// GET ALL INVENTORY
// GET /api/store/inventory/all
// ==========================================

const getInventoryItems = async (req, res) => {
  try {
    const items = await Inventory.find({}).sort({ createdAt: -1 }).lean();

    const inventory = items.map(formatInventory);

    const missingItemCodes = inventory.filter((item) => !item.itemCode).length;

    return res.status(200).json({
      success: true,
      count: inventory.length,

      // Support old and new frontend formats.
      inventory,
      items: inventory,

      summary: {
        total: inventory.length,
        withItemCode: inventory.length - missingItemCodes,
        missingItemCodes,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// GET SINGLE INVENTORY
// GET /api/store/inventory/:id
// ==========================================

const getSingleInventoryItem = async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid inventory ID",
      });
    }

    const item = await Inventory.findById(req.params.id).lean();

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Inventory item not found",
      });
    }

    return res.status(200).json({
      success: true,
      item: formatInventory(item),
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// UPDATE INVENTORY METADATA
// PUT /api/store/inventory/:id
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

    // Stock must remain ledger-controlled.
    const blockedFields = [
      "quantity",
      "currentStock",
      "openingQuantity",
      "incomingQuantity",
      "outgoingQuantity",
      "status",
    ];

    const attemptedStockEdit = blockedFields.some(
      (field) => req.body[field] !== undefined,
    );

    if (attemptedStockEdit) {
      return res.status(400).json({
        success: false,
        message:
          "Stock quantity cannot be edited here. Use Stock Inward or an authorized adjustment.",
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
      item: formatInventory(item),
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// SOFT DELETE INVENTORY ITEM
// ==========================================

const deleteInventoryItem = async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid inventory ID",
      });
    }

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
      item: formatInventory(item),
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// DISABLE DIRECT STOCK REPLACEMENT
// ==========================================

const updateStock = async (req, res) => {
  return res.status(409).json({
    success: false,
    message:
      "Direct stock replacement is disabled. Use Stock Inward / Adjustment workflow.",
  });
};

// ==========================================
// LOW STOCK
// ==========================================

const getLowStockItems = async (req, res) => {
  try {
    const items = await Inventory.find({
      isActive: { $ne: false },
      $expr: {
        $lte: ["$currentStock", "$minimumStock"],
      },
    })
      .sort({ createdAt: -1 })
      .lean();

    const lowStockItems = items.map(formatInventory);

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
