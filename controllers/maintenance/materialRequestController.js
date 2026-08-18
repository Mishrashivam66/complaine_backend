const MaterialRequest = require("../../models/MaterialRequest");

const Complaint = require("../../models/Complaint");

// ==========================================
// GET ALL MATERIAL REQUESTS
// ==========================================

exports.getAllMaterialRequests = async (req, res) => {
  try {
    const requests = await MaterialRequest.find()

      .populate({
        path: "complaint",

        select: `
          complaintId
          title
          titleHindi
          description
          descriptionHindi
          hostel
          block
          floor
          roomNumber
          category
          priority
          status
          assignedTo
          createdBy
        `,

        populate: [
          {
            path: "assignedTo",

            select: `
              name
              phone
              department
              shift
            `,
          },

          {
            path: "createdBy",

            select: `
              name
              email
              phone
            `,
          },
        ],
      })

      .populate("requestedBy", "name role")

      .populate("assignedWorker", "name phone department shift")

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
    console.log("GET MATERIAL REQUEST ERROR:", error);

    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// CREATE MATERIAL REQUEST
// ==========================================

exports.createMaterialRequest = async (req, res) => {
  try {
    const {
      complaintId,

      materials,

      reason,
    } = req.body;

    // ======================================
    // VALIDATION
    // ======================================

    if (!complaintId) {
      return res.status(400).json({
        success: false,

        message: "Complaint ID is required",
      });
    }

    if (!Array.isArray(materials) || materials.length === 0) {
      return res.status(400).json({
        success: false,

        message: "At least one material is required",
      });
    }

    if (!reason?.trim()) {
      return res.status(400).json({
        success: false,

        message: "Reason is required",
      });
    }

    // ======================================
    // VALIDATE MATERIALS
    // ======================================

    for (const material of materials) {
      if (
        !material.itemName?.trim() ||
        !material.quantity ||
        Number(material.quantity) <= 0 ||
        !material.unit
      ) {
        return res.status(400).json({
          success: false,

          message: "Every material must contain item name, quantity and unit",
        });
      }
    }

    // ======================================
    // FIND COMPLAINT
    // ======================================

    const complaint = await Complaint.findById(complaintId);

    if (!complaint) {
      return res.status(404).json({
        success: false,

        message: "Complaint not found",
      });
    }

    // ======================================
    // WORKER MUST BE ASSIGNED
    // ======================================

    if (!complaint.assignedTo) {
      return res.status(400).json({
        success: false,

        message: "Assign worker before creating material request",
      });
    }

    // ======================================
    // PREVENT DUPLICATE ACTIVE REQUEST
    // ======================================

    const existingRequest = await MaterialRequest.findOne({
      complaint: complaint._id,

      status: {
        $in: [
          "PENDING",
          "APPROVED_BY_STORE",
          "PARTIALLY_APPROVED",
          "PARTIALLY_ISSUED",
        ],
      },
    });

    if (existingRequest) {
      return res.status(400).json({
        success: false,

        message: "Active material request already exists for this complaint",
      });
    }

    // ======================================
    // CREATE REQUEST ID
    // ======================================

    const requestId = `MAT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // ======================================
    // CLEAN MATERIAL DATA
    // ======================================

    const materialItems = materials.map((material) => ({
      itemName: material.itemName.trim(),

      quantity: Number(material.quantity),

      unit: material.unit.trim().toUpperCase(),

      status: "PENDING",
    }));

    // ======================================
    // CREATE REQUEST
    // ======================================

    const request = await MaterialRequest.create({
      requestId,

      complaint: complaint._id,

      assignedWorker: complaint.assignedTo,

      requestedBy: req.user._id,

      materials: materialItems,

      reason: reason.trim(),

      status: "PENDING",
    });

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(201).json({
      success: true,

      message: "Material request created successfully",

      request,
    });
  } catch (error) {
    console.log("CREATE MATERIAL REQUEST ERROR:", error);

    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// DELETE MATERIAL REQUEST
// ==========================================

exports.deleteMaterialRequest = async (req, res) => {
  try {
    const request = await MaterialRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,

        message: "Material request not found",
      });
    }

    // ONLY PENDING REQUEST CAN BE DELETED

    if (request.status !== "PENDING") {
      return res.status(400).json({
        success: false,

        message: "Only pending material requests can be deleted",
      });
    }

    await request.deleteOne();

    return res.status(200).json({
      success: true,

      message: "Material request deleted successfully",
    });
  } catch (error) {
    console.log("DELETE MATERIAL REQUEST ERROR:", error);

    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};
