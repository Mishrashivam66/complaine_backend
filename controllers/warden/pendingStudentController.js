const User = require("../../models/User");

// ==========================================
// GET PENDING HOSTEL STUDENTS
// ==========================================

exports.getPendingStudents = async (req, res) => {
  try {
    // ==========================================
    // GET WARDEN HOSTEL
    // ==========================================

    const hostel = req.user.assignedHostel;

    // ==========================================
    // FIND PENDING STUDENTS
    // ==========================================

    const students = await User.find({
      role: "STUDENT",

      isHosteller: true,

      hostel: hostel,

      isApproved: false,
    }).select("-password");

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      count: students.length,

      data: students,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Server Error",
    });
  }
};

// ==========================================
// APPROVE STUDENT
// ==========================================

exports.approveStudent = async (req, res) => {
  try {
    // ==========================================
    // FIND STUDENT
    // ==========================================

    const student = await User.findById(req.params.id);

    // ==========================================
    // CHECK STUDENT
    // ==========================================

    if (!student) {
      return res.status(404).json({
        success: false,

        message: "Student not found",
      });
    }

    // ==========================================
    // APPROVE STUDENT
    // ==========================================

    student.isApproved = true;

    student.approvedBy = req.user._id;

    student.approvedAt = new Date();

    student.assignedWarden = req.user._id;

    // ==========================================
    // SAVE
    // ==========================================

    await student.save();

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      message: "Student approved successfully",

      data: student,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Server Error",
    });
  }
};

// ==========================================
// REJECT STUDENT
// ==========================================

exports.rejectStudent = async (req, res) => {
  try {
    // ==========================================
    // FIND STUDENT
    // ==========================================

    const student = await User.findById(req.params.id);

    // ==========================================
    // CHECK STUDENT
    // ==========================================

    if (!student) {
      return res.status(404).json({
        success: false,

        message: "Student not found",
      });
    }

    // ==========================================
    // DELETE STUDENT
    // ==========================================

    await User.findByIdAndDelete(req.params.id);

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      message: "Student rejected successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Server Error",
    });
  }
};
