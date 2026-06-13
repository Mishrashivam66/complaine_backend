const Inventory = require("../../models/Inventory");

// ==========================================
// CREATE INVENTORY ITEM
// ==========================================

const createInventoryItem = async (req, res) => {
  try {
    const { itemName, category, otherCategory, quantity, minimumStock, unit } =
      req.body;

    // ==========================================
    // VALIDATION
    // ==========================================

    if (!itemName || !category || !quantity || !minimumStock || !unit) {
      return res.status(400).json({
        success: false,

        message: "All fields are required",
      });
    }

    // ==========================================
    // CREATE INVENTORY
    // ==========================================

    const item = await Inventory.create({
      itemName,

      category,

      otherCategory,

      currentStock: Number(quantity),

      minimumStock: Number(minimumStock),

      unit,
    });

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(201).json({
      success: true,

      message: "Inventory item created successfully",

      item,
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// GET ALL INVENTORY ITEMS
// ==========================================

const getInventoryItems = async (req, res) => {
  try {
    const items = await Inventory.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: items.length,
      items,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================================
// GET SINGLE INVENTORY ITEM
// ==========================================

const getSingleInventoryItem = async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Inventory item not found",
      });
    }

    res.status(200).json({
      success: true,
      item,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================================
// UPDATE INVENTORY ITEM
// ==========================================

const updateInventoryItem = async (req, res) => {
  try {
    const {
      currentStock,

      minimumStock,
    } = req.body;

    // ==========================================
    // FIND ITEM
    // ==========================================

    const item = await Inventory.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,

        message: "Inventory item not found",
      });
    }

    // ==========================================
    // UPDATE STOCK
    // ==========================================

    if (currentStock !== undefined) {
      item.currentStock = Number(currentStock);
    }

    // ==========================================
    // UPDATE MINIMUM STOCK
    // ==========================================

    if (minimumStock !== undefined) {
      item.minimumStock = Number(minimumStock);
    }

    // ==========================================
    // AUTO STATUS UPDATE
    // ==========================================

    if (item.currentStock === 0) {
      item.status = "Out Of Stock";
    } else if (item.currentStock <= item.minimumStock) {
      item.status = "Low Stock";
    } else {
      item.status = "Available";
    }

    // ==========================================
    // SAVE
    // ==========================================

    await item.save();

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      message: "Inventory updated successfully",

      item,
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// DELETE INVENTORY ITEM
// ==========================================

const deleteInventoryItem = async (req, res) => {
  try {
    const item = await Inventory.findByIdAndDelete(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Inventory item not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Inventory item deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================================
// UPDATE STOCK
// ==========================================

const updateStock = async (req, res) => {
  try {
    const { currentStock } = req.body;

    const item = await Inventory.findByIdAndUpdate(
      req.params.id,

      { currentStock },

      {
        new: true,
      },
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Inventory item not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Stock updated successfully",
      item,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================================
// GET LOW STOCK ITEMS
// ==========================================

const getLowStockItems = async (req, res) => {
  try {
    const lowStockItems = await Inventory.find({
      $expr: {
        $lte: ["$currentStock", "$minimumStock"],
      },
    });

    res.status(200).json({
      success: true,

      lowStockItems,
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
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
