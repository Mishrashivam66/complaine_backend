const User = require("../../models/User");

// ======================================
// GET ALL STUDENTS
// ======================================

exports.getStudents = async (req, res) => {
  try {
    const students = await User.find({
      role: "STUDENT",
    }).sort({
      createdAt: -1,
    });

    // ======================================
    // STATS
    // ======================================

    const activeStudents = students.filter(
      (student) => student.studentStatus === "ACTIVE",
    ).length;

    const pendingStudents = students.filter(
      (student) => student.studentStatus === "PENDING",
    ).length;

    const leftStudents = students.filter(
      (student) => student.studentStatus === "LEFT_HOSTEL",
    ).length;

    // HOSTELLER
    const hostellerStudents = students.filter(
      (student) => student.isHosteller === true,
    ).length;

    // DAY SCHOLAR
    const nonHostellerStudents = students.filter(
      (student) => student.isHosteller === false,
    ).length;

    const totalStudents = students.length;

    // ======================================
    // HOSTEL ANALYTICS
    // ======================================

    const hostelAnalytics = ["H1", "H2", "H3", "H4", "H5"].map((hostelName) => {
      const hostelStudents = students.filter(
        (student) =>
          student.hostel === hostelName &&
          student.studentStatus !== "LEFT_HOSTEL",
      );

      const occupied = hostelStudents.length;

      const capacity = 500;

      return {
        hostel: hostelName,

        occupied,

        capacity,

        remaining: capacity - occupied,
      };
    });

    // ======================================
    // RESPONSE
    // ======================================

    res.status(200).json({
      success: true,

      students,

      stats: {
        activeStudents,

        pendingStudents,

        leftStudents,

        hostellerStudents,

        nonHostellerStudents,

        totalStudents,
      },

      hostelAnalytics,
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
// REMOVE STUDENT
// ======================================

exports.deleteStudent = async (req, res) => {
  try {
    const student = await User.findById(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,

        message: "Student not found",
      });
    }

    // ======================================
    // HOSTELLER
    // ======================================

    if (student.isHosteller) {
      student.studentStatus = "LEFT_HOSTEL";

      student.roomNumber = "N/A";

      await student.save();

      return res.status(200).json({
        success: true,

        message: "Student moved to left hostel",
      });
    }

    // ======================================
    // DAY SCHOLAR
    // ======================================

    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,

      message: "Day scholar removed successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};
