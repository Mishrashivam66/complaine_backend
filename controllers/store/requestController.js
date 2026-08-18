const MaterialRequest = require("../../models/MaterialRequest");

// ==========================================
// CREATE REQUEST
exports.createRequest = async (req, res) => {
  try {
    const { hostel, item, quantity } = req.body;

    if (!hostel || !item || !quantity) {
      return res.status(400).json({
        success: false,
        message: "Hostel, item and quantity are required",
      });
    }

    const request = await Request.create({
      hostel,
      item: item.trim(),
      quantity: Number(quantity),
      requestedBy: req.user.name,
    });

    return res.status(201).json({
      success: true,
      message: "Request created successfully",
      request,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// ==========================================
// GET ALL REQUESTS
// =========================================
// ==========================================
// GET STORE MATERIAL REQUESTS
// ==========================================

exports.getRequests = async (req, res) => {
  try {
    const requests = await MaterialRequest.find()

      .populate({
        path: "complaint",

        select: `
            complaintId
            title
            hostel
            block
            floor
            roomNumber
            category
            priority
            status
          `,
      })

      .populate("assignedWorker", "name phone department shift")

      .populate("requestedBy", "name role")

      .populate("approvedByStore", "name role")

      .populate("issuedBy", "name role")

      .sort({
        createdAt: -1,
      });

    return res.status(200).json({
      success: true,

      count: requests.length,

      requests,
    });
  } catch (error) {
    console.log("STORE REQUEST ERROR:", error);

    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// UPDATE MATERIAL ITEM STATUS
// ==========================================

exports.updateMaterialStatus = async (req, res) => {
  try {
    const { requestId, materialId } = req.params;

    const { status, approvedQuantity, storeRemarks } = req.body;

    const validStatuses = ["APPROVED", "REJECTED", "OUT_OF_STOCK"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,

        message: "Invalid material status",
      });
    }

    const request = await MaterialRequest.findById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,

        message: "Material request not found",
      });
    }

    const material = request.materials.id(materialId);

    if (!material) {
      return res.status(404).json({
        success: false,

        message: "Material not found",
      });
    }

    material.status = status;

    material.storeRemarks = storeRemarks || "";

    if (status === "APPROVED") {
      const approveQty = Number(approvedQuantity || material.quantity);

      if (approveQty <= 0 || approveQty > material.quantity) {
        return res.status(400).json({
          success: false,

          message: "Invalid approved quantity",
        });
      }

      material.approvedQuantity = approveQty;

      request.approvedByStore = req.user._id;

      request.approvedAt = new Date();
    }

    // ======================================
    // UPDATE OVERALL STATUS
    // ======================================

    const statuses = request.materials.map((item) => item.status);

    if (statuses.every((item) => item === "APPROVED")) {
      request.status = "APPROVED_BY_STORE";
    } else if (statuses.every((item) => item === "REJECTED")) {
      request.status = "REJECTED";
    } else if (statuses.every((item) => item === "OUT_OF_STOCK")) {
      request.status = "OUT_OF_STOCK";
    } else if (statuses.some((item) => item === "APPROVED")) {
      request.status = "PARTIALLY_APPROVED";
    }

    await request.save();

    return res.status(200).json({
      success: true,

      message: "Material status updated",

      request,
    });
  } catch (error) {
    console.log("UPDATE MATERIAL ERROR:", error);

    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};
