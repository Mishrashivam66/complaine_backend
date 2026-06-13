const Inventory = require("../../models/Inventory");

// ==========================================
// ADD INVENTORY
// ==========================================

exports.addInventory = async (req, res) => {
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
    // CHECK EXISTING ITEM
    // ==========================================

    const existingItem = await Inventory.findOne({
      itemName,
    });

    if (existingItem) {
      return res.status(400).json({
        success: false,

        message: "Item already exists",
      });
    }

    // ==========================================
    // CREATE INVENTORY
    // ==========================================

    const inventory = await Inventory.create({
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

    return res.status(201).json({
      success: true,

      message: "Inventory Added Successfully",

      inventory,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// GET ALL INVENTORY
// ==========================================

exports.getAllInventory = async (req, res) => {
  try {
    const inventory = await Inventory.find()

      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,

      inventory,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// GET SINGLE INVENTORY
// ==========================================

exports.getSingleInventory = async (req, res) => {
  try {
    const inventory = await Inventory.findById(req.params.id);

    if (!inventory) {
      return res.status(404).json({
        success: false,

        message: "Inventory not found",
      });
    }

    return res.status(200).json({
      success: true,

      inventory,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// UPDATE INVENTORY
// ==========================================

exports.updateInventory = async (req, res) => {
  try {
    const inventory = await Inventory.findByIdAndUpdate(
      req.params.id,

      req.body,

      {
        new: true,

        runValidators: true,
      },
    );

    if (!inventory) {
      return res.status(404).json({
        success: false,

        message: "Inventory not found",
      });
    }

    return res.status(200).json({
      success: true,

      message: "Inventory updated successfully",

      inventory,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// DELETE INVENTORY
// ==========================================

exports.deleteInventory = async (req, res) => {
  try {
    const inventory = await Inventory.findByIdAndDelete(req.params.id);

    if (!inventory) {
      return res.status(404).json({
        success: false,

        message: "Inventory not found",
      });
    }

    return res.status(200).json({
      success: true,

      message: "Inventory deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// LOW STOCK ITEMS
// ==========================================

exports.getLowStockItems = async (req, res) => {
  try {
    const lowStockItems = await Inventory.find({
      $expr: {
        $lte: ["$currentStock", "$minimumStock"],
      },
    }).sort({
      createdAt: -1,
    });

    return res.status(200).json({
      success: true,

      count: lowStockItems.length,

      lowStockItems,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};
