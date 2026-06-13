const DamagedItem = require("../../models/DamagedItem");

const Inventory = require("../../models/Inventory");

// ==========================================
// ADD DAMAGED ITEM
// ==========================================

exports.addDamagedItem = async (req, res) => {
  try {
    const {
      item,

      hostel,

      quantity,

      issue,

      condition,
    } = req.body;

    // ======================================
    // VALIDATION
    // ======================================

    if (!item || !hostel || !quantity || !issue) {
      return res.status(400).json({
        success: false,

        message: "Please fill all fields",
      });
    }

    // ======================================
    // FIND INVENTORY
    // ======================================

    const inventory = await Inventory.findOne({
      itemName: {
        $regex: `^${item}$`,

        $options: "i",
      },
    });

    // ======================================
    // REDUCE STOCK
    // ======================================

    if (inventory) {
      inventory.currentStock -= Number(quantity);

      if (inventory.currentStock < 0) {
        inventory.currentStock = 0;
      }

      await inventory.save();
    }

    // ======================================
    // CREATE DAMAGE ENTRY
    // ======================================

    const damagedItem = await DamagedItem.create({
      item,

      hostel,

      quantity,

      issue,

      condition,
    });

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(201).json({
      success: true,

      message: "Damaged item added successfully",

      damagedItem,
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
// GET ALL DAMAGED ITEMS
// ==========================================

exports.getDamagedItems = async (req, res) => {
  try {
    const damagedItems = await DamagedItem.find()

      .sort({
        createdAt: -1,
      });

    return res.status(200).json({
      success: true,

      damagedItems,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// UPDATE DAMAGE STATUS
// ==========================================

exports.updateDamagedStatus = async (req, res) => {
  try {
    const { condition } = req.body;

    const item = await DamagedItem.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,

        message: "Damaged item not found",
      });
    }

    item.condition = condition;

    await item.save();

    return res.status(200).json({
      success: true,

      message: "Condition updated successfully",

      item,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// DELETE DAMAGED ITEM
// ==========================================

exports.deleteDamagedItem = async (req, res) => {
  try {
    const item = await DamagedItem.findByIdAndDelete(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,

        message: "Damaged item not found",
      });
    }

    return res.status(200).json({
      success: true,

      message: "Damaged item deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};
