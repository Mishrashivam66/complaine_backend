const Complaint = require("../../models/Complaint");

// ==========================================
// CREATE COMPLAINT
// ==========================================

const createComplaint = async (req, res) => {
  try {
    const { title, description, category, priority, roomNumber } = req.body;

    // ==========================================
    // VALIDATION
    // ==========================================

    if (!title || !description || !category) {
      return res.status(400).json({
        success: false,

        message: "All required fields are mandatory",
      });
    }

    // ==========================================
    // CREATE COMPLAINT
    // ==========================================

    const complaint = await Complaint.create({
      title,

      description,

      category,

      priority: priority || "MEDIUM",

      roomNumber,

      student: req.user._id,

      // STUDENT HOSTEL

      hostel: req.user.hostel,

      status: "PENDING",
    });

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(201).json({
      success: true,

      message: "Complaint submitted successfully",

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
// GET ALL HOSTEL COMPLAINTS
// ==========================================

const getHostelComplaints = async (req, res) => {
  try {
    // ==========================================
    // WARDEN HOSTEL
    // ==========================================

    const hostel = req.user.assignedHostel;

    // ==========================================
    // FETCH COMPLAINTS
    // ==========================================

    const complaints = await Complaint.find({
      hostel,
    })

      .populate("student", "name email roomNumber")

      .sort({
        createdAt: -1,
      });

    // ==========================================
    // RESPONSE
    // ==========================================

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

const getSingleComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id).populate(
      "student",
      "name email roomNumber",
    );

    // ==========================================
    // NOT FOUND
    // ==========================================

    if (!complaint) {
      return res.status(404).json({
        success: false,

        message: "Complaint not found",
      });
    }

    // ==========================================
    // RESPONSE
    // ==========================================

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
// UPDATE COMPLAINT STATUS
// ==========================================

const updateComplaintStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const complaint = await Complaint.findById(req.params.id);

    // ==========================================
    // NOT FOUND
    // ==========================================

    if (!complaint) {
      return res.status(404).json({
        success: false,

        message: "Complaint not found",
      });
    }

    // ==========================================
    // UPDATE STATUS
    // ==========================================

    complaint.status = status;

    // ==========================================
    // RESOLVED
    // ==========================================

    if (status === "RESOLVED") {
      complaint.resolvedAt = new Date();
    }

    await complaint.save();

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      message: "Complaint status updated",

      complaint,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to update complaint status",
    });
  }
};

// ==========================================
// ASSIGN WORKER
// ==========================================

const assignWorker = async (req, res) => {
  try {
    const { assignedWorker } = req.body;

    const complaint = await Complaint.findById(req.params.id);

    // ==========================================
    // NOT FOUND
    // ==========================================

    if (!complaint) {
      return res.status(404).json({
        success: false,

        message: "Complaint not found",
      });
    }

    // ==========================================
    // ASSIGN WORKER
    // ==========================================

    complaint.assignedWorker = assignedWorker;

    complaint.status = "ASSIGNED";

    await complaint.save();

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      message: "Worker assigned successfully",

      complaint,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to assign worker",
    });
  }
};

// ==========================================
// ESCALATE COMPLAINT
// ==========================================

// ==========================================
// ESCALATE COMPLAINT
// ==========================================

// ==========================================
// ESCALATE COMPLAINT
// ==========================================

const escalateComplaint = async (req, res) => {
  try {
    const { escalationReason } = req.body;

    const complaint = await Complaint.findById(req.params.id);

    // ==========================================
    // CHECK
    // ==========================================

    if (!complaint) {
      return res.status(404).json({
        success: false,

        message: "Complaint not found",
      });
    }

    // ==========================================
    // UPDATE
    // ==========================================

    complaint.priority = "URGENT";

    complaint.isEscalated = true;

    complaint.escalationReason = escalationReason || "Urgent Issue";

    complaint.escalatedAt = new Date();

    complaint.status = "IN_PROGRESS";

    // ==========================================
    // SAVE
    // ==========================================

    await complaint.save();

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      message: "Complaint escalated successfully",

      complaint,
    });
  } catch (error) {
    console.log("ESCALATE ERROR:", error);

    res.status(500).json({
      success: false,

      message: "Failed to escalate complaint",
    });
  }
};

// ==========================================
// DELETE COMPLAINT
// ==========================================

const deleteComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);

    // ==========================================
    // NOT FOUND
    // ==========================================

    if (!complaint) {
      return res.status(404).json({
        success: false,

        message: "Complaint not found",
      });
    }

    // ==========================================
    // DELETE
    // ==========================================

    await complaint.deleteOne();

    // ==========================================
    // RESPONSE
    // ==========================================

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

  getHostelComplaints,

  getSingleComplaint,

  updateComplaintStatus,

  assignWorker,

  escalateComplaint,

  deleteComplaint,
};
