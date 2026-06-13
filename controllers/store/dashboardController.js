const Inventory = require("../../models/Inventory");

const Request = require("../../models/Request");

const IssuedItem = require("../../models/IssuedItem");

// ==========================================
// STORE DASHBOARD
// ==========================================

exports.getStoreDashboard = async (req, res) => {
  try {
    // ======================================
    // TOTAL INVENTORY
    // ======================================

    const totalInventory = await Inventory.countDocuments();

    // ======================================
    // LOW STOCK ITEMS
    // ======================================

    const lowStockItems = await Inventory.find({
      $expr: {
        $lte: ["$currentStock", "$minimumStock"],
      },
    });

    // ======================================
    // PENDING REQUESTS
    // ======================================

    const pendingRequests = await Request.countDocuments({
      status: "Pending",
    });

    // ======================================
    // ISSUED ITEMS
    // ======================================

    const issuedItems = await IssuedItem.countDocuments();

    // ======================================
    // RECENT REQUESTS
    // ======================================

    const recentRequests = await Request.find()

      .sort({
        createdAt: -1,
      })

      .limit(5);

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      totalInventory,

      lowStock: lowStockItems.length,

      pendingRequests,

      issuedItems,

      recentRequests,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};
