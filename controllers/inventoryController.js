const Inventory = require("../models/Inventory");

// Add Item
const createInventoryItem = async (req, res) => {
  try {
    const item = await Inventory.create(req.body);

    res.status(201).json({
      success: true,
      item,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Get All Items
const getInventoryItems = async (req, res) => {
  try {
    const items = await Inventory.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      items,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Update Stock
const updateStock = async (req, res) => {
  try {
    const { currentStock } = req.body;

    const item = await Inventory.findByIdAndUpdate(
      req.params.id,
      { currentStock },
      { new: true },
    );

    res.status(200).json({
      success: true,
      item,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

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

module.exports = {
  createInventoryItem,
  getInventoryItems,
  updateStock,
  getLowStockItems,
};
