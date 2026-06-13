const Inventory = require("../../models/Inventory");

// ======================================
// GET INVENTORY
// ======================================

exports.getInventory = async (req, res) => {
  try {
    const items = await Inventory.find({
      isActive: true,
    });

    res.status(200).json({
      success: true,
      items,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch inventory",
    });
  }
};

// ======================================
// ADD INVENTORY
// ======================================

exports.addInventory = async (req, res) => {
  try {
    const {
      itemName,

      category,

      otherCategory,

      currentStock,

      minimumStock,

      unit,
    } = req.body;

    const item = await Inventory.create({
      itemName,

      category,

      otherCategory,

      currentStock,

      minimumStock,

      unit,
    });

    res.status(201).json({
      success: true,
      item,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Failed to add inventory",
    });
  }
};

// ======================================
// DELETE INVENTORY
// ======================================

exports.deleteInventory = async (req, res) => {
  try {
    await Inventory.findByIdAndUpdate(
      req.params.id,

      {
        isActive: false,
      },
    );

    res.status(200).json({
      success: true,
      message: "Inventory Deleted",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Delete failed",
    });
  }
};
