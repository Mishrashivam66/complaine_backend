// ==========================================
// IMPORTS
// ==========================================

const Escalation = require("../../models/Escalation");

const Complaint = require("../../models/Complaint");

// ==========================================
// CREATE ESCALATION
// ==========================================

const createEscalation = async (req, res) => {
  try {
    const { complaintId, escalationLevel, remarks } = req.body;

    // Find complaint
    const complaint = await Complaint.findById(complaintId)

      .populate("student", "name email");

    if (!complaint) {
      return res.status(404).json({
        success: false,

        message: "Complaint not found",
      });
    }

    // Create escalation
    const escalation = await Escalation.create({
      complaint: complaint._id,

      student: complaint.student._id,

      hostel: complaint.hostel,

      room: complaint.roomNumber,

      category: complaint.category,

      assignedTo: complaint.assignedWorker,

      priority: complaint.priority,

      escalationLevel: escalationLevel || "LEVEL 1",

      remarks,

      status: "PENDING",
    });

    res.status(201).json({
      success: true,

      message: "Complaint escalated successfully",

      escalation,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to create escalation",
    });
  }
};

// ==========================================
// GET ALL ESCALATIONS
// ==========================================

const getEscalations = async (req, res) => {
  try {
    const escalations = await Escalation.find({
      hostel: req.user.hostel,
    })

      .populate("complaint")

      .populate("student", "name email")

      .sort({
        createdAt: -1,
      });

    res.status(200).json({
      success: true,

      count: escalations.length,

      escalations,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to fetch escalations",
    });
  }
};

// ==========================================
// GET SINGLE ESCALATION
// ==========================================

const getSingleEscalation = async (req, res) => {
  try {
    const escalation = await Escalation.findById(req.params.id)

      .populate("complaint")

      .populate("student", "name email");

    if (!escalation) {
      return res.status(404).json({
        success: false,

        message: "Escalation not found",
      });
    }

    res.status(200).json({
      success: true,

      escalation,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to fetch escalation",
    });
  }
};

// ==========================================
// UPDATE ESCALATION STATUS
// ==========================================

const updateEscalationStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const escalation = await Escalation.findById(req.params.id);

    if (!escalation) {
      return res.status(404).json({
        success: false,

        message: "Escalation not found",
      });
    }

    escalation.status = status;

    await escalation.save();

    res.status(200).json({
      success: true,

      message: "Escalation updated successfully",

      escalation,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to update escalation",
    });
  }
};

// ==========================================
// DELETE ESCALATION
// ==========================================

const deleteEscalation = async (req, res) => {
  try {
    const escalation = await Escalation.findById(req.params.id);

    if (!escalation) {
      return res.status(404).json({
        success: false,

        message: "Escalation not found",
      });
    }

    await escalation.deleteOne();

    res.status(200).json({
      success: true,

      message: "Escalation deleted successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to delete escalation",
    });
  }
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  createEscalation,

  getEscalations,

  getSingleEscalation,

  updateEscalationStatus,

  deleteEscalation,
};
