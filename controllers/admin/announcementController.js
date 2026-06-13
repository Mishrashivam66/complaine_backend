const Announcement = require("../../models/Announcement");

// ======================================
// CREATE
// ======================================

const createAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.create({
      ...req.body,

      createdBy: req.user.id,
    });

    res.status(201).json({
      success: true,

      message: "Announcement created",

      announcement,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ======================================
// GET ALL
// ======================================

const getAnnouncements = async (req, res) => {
  try {
    const announcements = await Announcement.find()

      .populate("createdBy", "name role")

      .sort({
        createdAt: -1,
      });

    console.log("ANNOUNCEMENTS:", announcements);

    res.status(200).json({
      success: true,

      announcements,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ======================================
// DELETE
// ======================================

const deleteAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);

    if (!announcement) {
      return res.status(404).json({
        success: false,

        message: "Announcement not found",
      });
    }

    await announcement.deleteOne();

    res.status(200).json({
      success: true,

      message: "Announcement deleted",
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
  createAnnouncement,
  getAnnouncements,
  deleteAnnouncement,
};
