const IssuedItem = require("../../models/IssuedItem");

const Inventory = require("../../models/Inventory");

const Request = require("../../models/Request");

const DamagedItem = require("../../models/DamagedItem");

// ==========================================
// ISSUE ITEM
// ==========================================

exports.issueItem = async (req, res) => {
  try {
    const { requestId } = req.body;

    // ======================================
    // FIND REQUEST
    // ======================================

    const request = await Request.findById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,

        message: "Request not found",
      });
    }

    // ======================================
    // FIND INVENTORY ITEM
    // ======================================

    const inventory = await Inventory.findOne({
      itemName: {
        $regex: `^${request.item}$`,

        $options: "i",
      },
    });

    // ======================================
    // ITEM NOT FOUND / OUT OF STOCK
    // ======================================

    if (!inventory || inventory.currentStock <= 0) {
      const issuedItem = await IssuedItem.create({
        requestId: request._id,

        item: request.item,

        hostel: request.hostel,

        quantity: request.quantity,

        issuedTo: request.requestedBy,

        status: "Out Of Stock",
      });

      // ======================================
      // AUTO CREATE DAMAGED ITEM
      // ======================================

      await DamagedItem.create({
        item: request.item,

        hostel: request.hostel,

        quantity: request.quantity,

        issue: "Old item returned damaged",

        condition: "Damaged",
      });

      // ======================================
      // UPDATE REQUEST
      // ======================================

      request.status = "Approved";

      await request.save();

      return res.status(201).json({
        success: true,

        message: "Item out of stock",

        issuedItem,
      });
    }

    // ======================================
    // UPDATE INVENTORY STOCK
    // ======================================

    inventory.currentStock -= Number(request.quantity);

    if (inventory.currentStock < 0) {
      inventory.currentStock = 0;
    }

    await inventory.save();

    // ======================================
    // STATUS LOGIC
    // ======================================

    let itemStatus = "Issued";

    if (inventory.currentStock === 0) {
      itemStatus = "Out Of Stock";
    } else if (inventory.currentStock <= inventory.minimumStock) {
      itemStatus = "Low Stock";
    }

    // ======================================
    // CREATE ISSUED ITEM
    // ======================================

    const issuedItem = await IssuedItem.create({
      requestId: request._id,

      item: request.item,

      hostel: request.hostel,

      quantity: request.quantity,

      issuedTo: request.requestedBy,

      status: itemStatus,
    });

    // ======================================
    // AUTO CREATE DAMAGED ITEM
    // ======================================

    await DamagedItem.create({
      item: request.item,

      hostel: request.hostel,

      quantity: request.quantity,

      issue: "Old item returned damaged",

      condition: "Damaged",
    });

    // ======================================
    // UPDATE REQUEST STATUS
    // ======================================

    request.status = "Approved";

    await request.save();

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(201).json({
      success: true,

      message: "Item issued successfully",

      issuedItem,
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
// GET ISSUED ITEMS
// ==========================================

exports.getIssuedItems = async (req, res) => {
  try {
    const issuedItems = await IssuedItem.find()

      .sort({
        createdAt: -1,
      });

    return res.status(200).json({
      success: true,

      issuedItems,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// UPDATE ISSUED STATUS
// ==========================================

exports.updateIssuedStatus = async (req, res) => {
  try {
    const item = await IssuedItem.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,

        message: "Issued item not found",
      });
    }

    // ======================================
    // UPDATE STATUS
    // ======================================

    item.status = "Delivered";

    await item.save();

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      message: "Item delivered successfully",

      item,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};
