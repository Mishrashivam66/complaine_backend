const StudentHistory = require("../../models/StudentHistory");

// ==========================================
// CREATE HISTORY
// ==========================================

const createHistory = async (req, res) => {
  try {
    const {
      student,

      roomNumber,

      action,

      description,

      status,
    } = req.body;

    // ==========================================
    // VALIDATION
    // ==========================================

    if (!student || !action || !description) {
      return res.status(400).json({
        success: false,

        message: "Student, action and description are required",
      });
    }

    // ==========================================
    // CREATE HISTORY
    // ==========================================

    const history = await StudentHistory.create({
      student,

      hostel: req.user.assignedHostel || req.user.hostel,

      roomNumber,

      action,

      description,

      status: status || "ACTIVE",

      updatedBy: req.user._id,
    });

    res.status(201).json({
      success: true,

      message: "Student history created successfully",

      history,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to create history",
    });
  }
};

// ==========================================
// GET ALL HISTORY
// ==========================================

const getStudentHistory = async (req, res) => {
  try {
    const history = await StudentHistory.find({
      hostel: req.user.assignedHostel || req.user.hostel,
    })

      .populate("student", "name email")

      .populate("updatedBy", "name email")

      .sort({
        createdAt: -1,
      });

    res.status(200).json({
      success: true,

      count: history.length,

      history,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to fetch history",
    });
  }
};

// ==========================================
// GET SINGLE HISTORY
// ==========================================

const getSingleHistory = async (req, res) => {
  try {
    const history = await StudentHistory.findById(req.params.id)

      .populate("student", "name email")

      .populate("updatedBy", "name email");

    // ==========================================
    // CHECK HISTORY
    // ==========================================

    if (!history) {
      return res.status(404).json({
        success: false,

        message: "History not found",
      });
    }

    res.status(200).json({
      success: true,

      history,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to fetch history",
    });
  }
};

// ==========================================
// UPDATE HISTORY STATUS
// ==========================================

const updateHistoryStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const history = await StudentHistory.findById(req.params.id);

    // ==========================================
    // CHECK HISTORY
    // ==========================================

    if (!history) {
      return res.status(404).json({
        success: false,

        message: "History not found",
      });
    }

    // ==========================================
    // UPDATE STATUS
    // ==========================================

    history.status = status;

    await history.save();

    res.status(200).json({
      success: true,

      message: "History updated successfully",

      history,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to update history",
    });
  }
};

// ==========================================
// DELETE HISTORY
// ==========================================

const deleteHistory = async (req, res) => {
  try {
    const history = await StudentHistory.findById(req.params.id);

    // ==========================================
    // CHECK HISTORY
    // ==========================================

    if (!history) {
      return res.status(404).json({
        success: false,

        message: "History not found",
      });
    }

    // ==========================================
    // DELETE
    // ==========================================

    await history.deleteOne();

    res.status(200).json({
      success: true,

      message: "History deleted successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to delete history",
    });
  }
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  createHistory,

  getStudentHistory,

  getSingleHistory,

  updateHistoryStatus,

  deleteHistory,
};
