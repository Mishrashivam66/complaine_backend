
const Notice = require("../../models/Notice");

// ==========================================
// CREATE NOTICE
// ==========================================

const createNotice = async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      audience,
      priority,
      status,
    } = req.body;

    // ==========================================
    // VALIDATION
    // ==========================================

    if (!title || !description) {
      return res.status(400).json({
        success: false,

        message: "Title and Description are required",
      });
    }

    // ==========================================
    // CREATE
    // ==========================================

    const notice = await Notice.create({
      title,

      description,

      category,

      audience,

      priority,

      status,

      createdBy: req.user._id,

      hostel: req.user.hostel,
    });

    res.status(201).json({
      success: true,

      message: "Notice created successfully",

      notice,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// GET ALL NOTICES
// ==========================================

const getNotices = async (req, res) => {
  try {
    // ==========================================
    // HOSTEL BASED FETCH
    // ==========================================

    const notices = await Notice.find({
      hostel: req.user.hostel,
    })

      .populate("createdBy", "name email")

      .sort({
        createdAt: -1,
      });

    res.status(200).json({
      success: true,

      count: notices.length,

      notices,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// DELETE NOTICE
// ==========================================

const deleteNotice = async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);

    if (!notice) {
      return res.status(404).json({
        success: false,

        message: "Notice not found",
      });
    }

    await notice.deleteOne();

    res.status(200).json({
      success: true,

      message: "Notice deleted successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

module.exports = {
  createNotice,

  getNotices,

  deleteNotice,
};
