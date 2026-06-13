const MessComplaint = require("../../models/MessComplaint");

// ==========================================
// CREATE COMPLAINT
// ==========================================

const createMessComplaint = async (req, res) => {
  try {
    const {
      issue,

      mess,

      priority,

      rating,

      foodItem,
    } = req.body;

    const complaint = await MessComplaint.create({
      student: req.user._id,

      issue,

      mess,

      priority,

      rating,

      foodItem,
    });

    res.status(201).json({
      success: true,

      message: "Mess complaint created",

      complaint,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to create complaint",
    });
  }
};

// ==========================================
// GET ALL COMPLAINTS
// ==========================================

const getMessComplaints = async (req, res) => {
  try {
    // ==========================================
    // FETCH ALL
    // ==========================================

    const complaints = await MessComplaint.find()

      .populate(
        "student",

        "name email",
      )

      .sort({
        createdAt: -1,
      });

    res.status(200).json({
      success: true,

      count: complaints.length,

      complaints,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to fetch complaints",
    });
  }
};

// ==========================================
// GET SINGLE COMPLAINT
// ==========================================

const getSingleMessComplaint = async (req, res) => {
  try {
    const complaint = await MessComplaint.findById(req.params.id).populate(
      "student",

      "name email",
    );

    if (!complaint) {
      return res.status(404).json({
        success: false,

        message: "Complaint not found",
      });
    }

    res.status(200).json({
      success: true,

      complaint,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to fetch complaint",
    });
  }
};

// ==========================================
// UPDATE STATUS
// ==========================================

const updateMessComplaintStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const complaint = await MessComplaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({
        success: false,

        message: "Complaint not found",
      });
    }

    complaint.status = status;

    await complaint.save();

    res.status(200).json({
      success: true,

      message: "Complaint updated successfully",

      complaint,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to update complaint",
    });
  }
};

// ==========================================
// DELETE COMPLAINT
// ==========================================

const deleteMessComplaint = async (req, res) => {
  try {
    const complaint = await MessComplaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({
        success: false,

        message: "Complaint not found",
      });
    }

    await complaint.deleteOne();

    res.status(200).json({
      success: true,

      message: "Complaint deleted successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to delete complaint",
    });
  }
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  createMessComplaint,

  getMessComplaints,

  getSingleMessComplaint,

  updateMessComplaintStatus,

  deleteMessComplaint,
};
