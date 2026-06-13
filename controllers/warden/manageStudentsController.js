const User = require("../../models/User");

// ==========================================
// GET ALL STUDENTS
// ==========================================

const getAllStudents = async (req, res) => {
  try {
    const hostel = req.user.assignedHostel;

    const students = await User.find({
      role: "STUDENT",

      hostel,

      isHosteller: true,
    })
      .sort({
        createdAt: -1,
      })
      .select("-password");

    res.status(200).json({
      success: true,

      students,
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// GET SINGLE STUDENT
// ==========================================

const getStudentById = async (req, res) => {
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
// UPDATE STUDENT
// ==========================================

const updateStudent = async (req, res) => {
  try {
    const student = await User.findById(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,

        message: "Student not found",
      });
    }

    // ==========================================
    // UPDATE FIELDS
    // ==========================================

    student.roomNumber = req.body.roomNumber || student.roomNumber;

    student.block = req.body.block || student.block;

    student.phone = req.body.phone || student.phone;

    await student.save();

    res.status(200).json({
      success: true,

      message: "Student updated successfully",

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
// GET UNALLOCATED STUDENTS
// ==========================================

const getUnallocatedStudents = async (req, res) => {
  try {
    const students = await User.find({
      role: "STUDENT",

      isApproved: true,

      $or: [
        {
          roomNumber: "",
        },

        {
          roomNumber: null,
        },
      ],
    }).select("-password");

    res.status(200).json({
      success: true,

      students,
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

    await student.deleteOne();

    res.status(200).json({
      success: true,

      message: "Student removed successfully",
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
  getAllStudents,

  getStudentById,

  updateStudent,

  deleteStudent,

  getUnallocatedStudents,
};
