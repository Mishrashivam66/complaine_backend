const MessComplaint = require("../../models/MessComplaint");

// ==========================================
// CREATE COMPLAINT
// ==========================================

const createComplaint = async (req, res) => {
  try {
    const { title, description, category, rating } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        success: false,

        message: "All fields are required",
      });
    }

    const complaint = await MessComplaint.create({
      student: req.user._id,

      hostel: req.user.hostel,

      title,

      description,

      category,

      rating,
    });

    res.status(201).json({
      success: true,

      message: "Mess complaint submitted successfully",

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
// GET STUDENT COMPLAINTS
// ==========================================

const getStudentComplaints = async (req, res) => {
  try {
    const complaints = await MessComplaint.find({
      student: req.user._id,
    })

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
// GET ALL COMPLAINTS
// MESS MANAGER / ADMIN
// ==========================================

const getAllMessComplaints = async (req, res) => {
  try {
    const complaints = await MessComplaint.find()

      .populate(
        "student",

        "name",
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

      message: "Failed to fetch all complaints",
    });
  }
};

// ==========================================
// GET SINGLE COMPLAINT
// ==========================================

const getSingleComplaint = async (req, res) => {
  try {
    const complaint = await MessComplaint.findById(req.params.id).populate(
      "student",

      "name",
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

const updateComplaintStatus = async (req, res) => {
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

      message: "Complaint status updated",

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

const deleteComplaint = async (req, res) => {
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
  createComplaint,

  getStudentComplaints,

  getAllMessComplaints,

  getSingleComplaint,

  updateComplaintStatus,

  deleteComplaint,
};
