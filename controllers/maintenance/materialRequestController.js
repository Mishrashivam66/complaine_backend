const MaterialRequest = require("../../models/MaterialRequest");

const JobCard = require("../../models/JobCard");

const Request = require("../../models/Request");

// ==========================================
// GET ALL MATERIAL REQUESTS
// ==========================================

exports.getAllMaterialRequests = async (req, res) => {
  try {
    // ======================================
    // FETCH REQUESTS
    // ======================================

    const requests = await MaterialRequest.find()

      .populate({
        path: "jobCard",

        populate: [
          {
            path: "complaint",

            select: `
                  complaintId
                  title
                  hostel
                  roomNumber
                  category
                  priority
                `,
          },

          {
            path: "assignedWorker",

            select: `
                  name
                  phone
                  department
                `,
          },
        ],
      })

      .populate({
        path: "requestedBy",

        select: `
              name
              role
            `,
      })

      .sort({
        createdAt: -1,
      });

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      count: requests.length,

      message: "Material requests fetched successfully",

      requests,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,

      message: "Failed to fetch material requests",
    });
  }
};

// ==========================================
// CREATE MATERIAL REQUEST
// ==========================================

exports.createMaterialRequest = async (req, res) => {
  try {
    const {
      jobCardId,

      itemName,

      quantity,

      reason,
    } = req.body;

    // ======================================
    // VALIDATION
    // ======================================

    if (!jobCardId || !itemName || !quantity || !reason) {
      return res.status(400).json({
        success: false,

        message: "Please fill all fields",
      });
    }

    // ======================================
    // FIND JOB CARD
    // ======================================

    const jobCard = await JobCard.findById(jobCardId).populate("complaint");

    if (!jobCard) {
      return res.status(404).json({
        success: false,

        message: "Job card not found",
      });
    }

    // ======================================
    // CREATE MATERIAL REQUEST
    // ======================================

    const request = await MaterialRequest.create({
      requestId: `MAT-${Date.now()}`,

      jobCard: jobCard._id,

      requestedBy: req.user._id,

      itemName,

      quantity,

      reason,

      status: "PENDING",
    });

    // ======================================
    // CREATE STORE REQUEST
    // ======================================

    await Request.create({
      hostel: jobCard?.complaint?.hostel || "H1",

      item: itemName.trim(),

      quantity: quantity,

      requestedBy: req.user.name,

      status: "Pending",
    });

    // ======================================
    // UPDATE JOB CARD
    // ======================================

    jobCard.materialRequired = true;

    jobCard.status = "MATERIAL_REQUIRED";

    await jobCard.save();

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(201).json({
      success: true,

      message: "Material request created successfully",

      request,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,

      message: "Failed to create material request",
    });
  }
};

// ==========================================
// UPDATE MATERIAL REQUEST STATUS
// ==========================================

exports.updateMaterialRequestStatus = async (req, res) => {
  try {
    // ======================================
    // GET DATA
    // ======================================

    const { id } = req.params;

    const { status } = req.body;

    console.log("REQ STATUS:", status);

    // ======================================
    // VALID STATUS
    // ======================================

    const validStatuses = [
      "PENDING",

      "APPROVED_BY_STORE",

      "REJECTED",

      "ISSUED",

      "OUT_OF_STOCK",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,

        message: "Invalid status value",
      });
    }

    // ======================================
    // FIND REQUEST
    // ======================================

    const request = await MaterialRequest.findById(id);

    if (!request) {
      return res.status(404).json({
        success: false,

        message: "Material request not found",
      });
    }

    // ======================================
    // UPDATE STATUS
    // ======================================

    request.status = status;

    // ======================================
    // STORE APPROVAL
    // ======================================

    if (status === "APPROVED_BY_STORE") {
      request.approvedByStore = req.user._id;
    }

    // ======================================
    // ISSUED
    // ======================================

    if (status === "ISSUED") {
      request.issuedBy = req.user._id;

      request.issuedAt = new Date();
    }

    // ======================================
    // SAVE
    // ======================================

    await request.save();

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      message: "Material request updated successfully",

      request,
    });
  } catch (error) {
    console.log("UPDATE MATERIAL REQUEST ERROR:", error);

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

    await MaterialRequest.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      success: true,

      message: "Material request deleted successfully",
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,

      message: "Failed to delete request",
    });
  }
};
