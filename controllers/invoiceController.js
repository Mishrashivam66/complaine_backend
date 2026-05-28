const Invoice = require("../models/Invoice");
const MaterialRequest = require("../models/MaterialRequest");
const Inventory = require("../models/Inventory");

// Generate Invoice
const createInvoice = async (req, res) => {
  try {

    const {
      materialRequest,
      generatedBy
    } = req.body;

    const request =
      await MaterialRequest.findById(
        materialRequest
      );

    if (!request) {
      return res.status(404).json({
        message: "Material Request not found"
      });
    }

    const inventoryItem =
      await Inventory.findOne({
        itemName: request.itemName
      });

    if (!inventoryItem) {
      return res.status(404).json({
        message: "Inventory item not found"
      });
    }

    const totalAmount =
      request.quantity *
      inventoryItem.price;

    const invoice =
      await Invoice.create({

        invoiceId:
          "INV-" +
          Date.now().toString().slice(-6),

        materialRequest,

        itemName:
          request.itemName,

        quantity:
          request.quantity,

        unitPrice:
          inventoryItem.price,

        totalAmount,

        generatedBy

      });

    res.status(201).json({
      success: true,
      invoice
    });

  } catch (error) {

    res.status(500).json({
      message: error.message
    });

  }
};

// Get All Invoices
const getInvoices = async (req, res) => {
  try {

    const invoices =
      await Invoice.find()
      .populate("materialRequest")
      .populate("generatedBy")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      invoices
    });

  } catch (error) {

    res.status(500).json({
      message: error.message
    });

  }
};

module.exports = {
  createInvoice,
  getInvoices
};