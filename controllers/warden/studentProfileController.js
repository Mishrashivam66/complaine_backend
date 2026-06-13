const User = require("../../models/User");

const StudentHistory = require("../../models/StudentHistory");

// ==========================================
// GET SINGLE STUDENT
// ==========================================

const getStudentProfile = async (req, res) => {
  try {
    const student = await User.findById(req.params.id).select("-password");

    if (!student) {
      return res.status(404).json({
        success: false,

        message: "Student not found",
      });
    }

    res.status(200).json({
      success: true,

      student,
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// LOCK PROFILE
// ==========================================

const lockProfile = async (req, res) => {
  try {
    const student = await User.findById(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,

        message: "Student not found",
      });
    }

    student.profileEditLocked = true;

    await student.save();

    // HISTORY

    await StudentHistory.create({
      student: student._id,

      hostel: student.hostel,

      roomNumber: student.roomNumber,

      action: "PROFILE_UPDATED",

      description: "Profile locked by warden",

      status: "COMPLETED",

      updatedBy: req.user._id,
    });

    res.status(200).json({
      success: true,

      message: "Profile locked successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// UNLOCK PROFILE
// ==========================================

const unlockProfile = async (req, res) => {
  try {
    const student = await User.findById(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,

        message: "Student not found",
      });
    }

    student.profileEditLocked = false;

    await student.save();

    // HISTORY

    await StudentHistory.create({
      student: student._id,

      hostel: student.hostel,

      roomNumber: student.roomNumber,

      action: "PROFILE_UPDATED",

      description: "Profile unlocked by warden",

      status: "COMPLETED",

      updatedBy: req.user._id,
    });

    res.status(200).json({
      success: true,

      message: "Profile unlocked successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// APPROVE STUDENT
// ==========================================

const approveStudent = async (req, res) => {
  try {
    const student = await User.findById(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,

        message: "Student not found",
      });
    }

    student.isApproved = true;

    await student.save();

    // HISTORY

    await StudentHistory.create({
      student: student._id,

      hostel: student.hostel,

      roomNumber: student.roomNumber,

      action: "PROFILE_UPDATED",

      description: "Student approved by warden",

      status: "COMPLETED",

      updatedBy: req.user._id,
    });

    res.status(200).json({
      success: true,

      message: "Student approved successfully",

      student,
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// REJECT STUDENT
// ==========================================

const rejectStudent = async (req, res) => {
  try {
    const student = await User.findById(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,

        message: "Student not found",
      });
    }

    await StudentHistory.create({
      student: student._id,

      hostel: student.hostel,

      roomNumber: student.roomNumber,

      action: "DISCIPLINE",

      description: "Student rejected by warden",

      status: "COMPLETED",

      updatedBy: req.user._id,
    });

    await student.deleteOne();

    res.status(200).json({
      success: true,

      message: "Student rejected successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// REMOVE FROM HOSTEL
// ==========================================

const removeFromHostel = async (req, res) => {
  try {
    const student = await User.findById(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,

        message: "Student not found",
      });
    }

    student.isHosteller = false;

    student.hostel = "";

    student.block = "";

    student.roomNumber = "";

    student.hostelStatus = "LEFT";

    await student.save();

    // HISTORY

    await StudentHistory.create({
      student: student._id,

      hostel: "REMOVED",

      roomNumber: "N/A",

      action: "ROOM_CHANGED",

      description: "Student removed from hostel",

      status: "COMPLETED",

      updatedBy: req.user._id,
    });

    res.status(200).json({
      success: true,

      message: "Student removed from hostel",
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// DELETE STUDENT
// ==========================================

const deleteStudent = async (req, res) => {
  try {
    const student = await User.findById(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,

        message: "Student not found",
      });
    }

    await StudentHistory.create({
      student: student._id,

      hostel: student.hostel,

      roomNumber: student.roomNumber,

      action: "DISCIPLINE",

      description: "Student deleted by warden",

      status: "COMPLETED",

      updatedBy: req.user._id,
    });

    await student.deleteOne();

    res.status(200).json({
      success: true,

      message: "Student deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// UPDATE ROOM
// ==========================================

const updateRoom = async (req, res) => {
  try {
    const { roomNumber, block } = req.body;

    const student = await User.findById(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,

        message: "Student not found",
      });
    }

    student.roomNumber = roomNumber;

    student.block = block;

    await student.save();

    // HISTORY

    await StudentHistory.create({
      student: student._id,

      hostel: student.hostel,

      roomNumber,

      action: "ROOM_CHANGED",

      description: `Room updated to ${roomNumber}`,

      status: "COMPLETED",

      updatedBy: req.user?._id || null,
    });

    res.status(200).json({
      success: true,

      message: "Room updated successfully",

      student,
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  getStudentProfile,

  lockProfile,

  unlockProfile,

  approveStudent,

  rejectStudent,

  removeFromHostel,

  deleteStudent,

  updateRoom,
};
