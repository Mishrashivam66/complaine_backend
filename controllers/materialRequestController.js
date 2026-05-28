const MaterialRequest = require("../models/MaterialRequest");

// Create Material Request
const createMaterialRequest = async (req, res) => {
  try {
    const materialRequest = await MaterialRequest.create({
      requestId: "MR-" + Date.now().toString().slice(-6),
      ...req.body,
    });

    res.status(201).json({
      success: true,
      materialRequest,
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};


// Get All Material Requests
const getAllMaterialRequests = async (req, res) => {
  try {

    const requests = await MaterialRequest.find()
      .populate("jobCard")
      .populate("requestedBy")
      .populate("approvedByStore")
      .populate("issuedBy")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      requests,
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};


// Store Manager Approves Request
const approveMaterialRequest = async (req, res) => {
  try {

    const { storeManagerId } = req.body;

    const request =
      await MaterialRequest.findByIdAndUpdate(
        req.params.id,
        {
          status: "APPROVED_BY_STORE",
          approvedByStore: storeManagerId,
        },
        {
          new: true,
        }
      );

    if (!request) {
      return res.status(404).json({
        message: "Material Request not found",
      });
    }

    res.status(200).json({
      success: true,
      request,
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};


// Store Manager Issues Material
const issueMaterial = async (req, res) => {
  try {

    const { issuedBy } = req.body;

    const request =
      await MaterialRequest.findByIdAndUpdate(
        req.params.id,
        {
          status: "ISSUED",
          issuedBy,
        },
        {
          new: true,
        }
      );

    if (!request) {
      return res.status(404).json({
        message: "Material Request not found",
      });
    }

    res.status(200).json({
      success: true,
      request,
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  createMaterialRequest,
  getAllMaterialRequests,
  approveMaterialRequest,
  issueMaterial,
};