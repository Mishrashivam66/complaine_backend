const User = require("../../models/User");

// ==========================================
// GET WARDEN DASHBOARD
// ==========================================

const getDashboardData = async (req, res) => {
  try {
    // ==========================================
    // HOSTEL
    // ==========================================

    const hostel = req.user.assignedHostel;

    // ==========================================
    // TOTAL STUDENTS
    // ==========================================

    const totalStudents = await User.countDocuments({
      role: "STUDENT",

      hostel,

      isHosteller: true,
    });

    // ==========================================
    // PENDING APPROVALS
    // ==========================================

    const pendingApprovals = await User.countDocuments({
      role: "STUDENT",

      hostel,

      isHosteller: true,

      isApproved: false,
    });

    // ==========================================
    // APPROVED STUDENTS
    // ==========================================

    const approvedStudents = await User.countDocuments({
      role: "STUDENT",

      hostel,

      isHosteller: true,

      isApproved: true,
    });

    // ==========================================
    // RECENT STUDENTS
    // ==========================================

    const recentStudents = await User.find({
      role: "STUDENT",

      hostel,

      isHosteller: true,

      isApproved: true,
    })

      .sort({
        createdAt: -1,
      })

      .limit(5)

      .select("name roomNumber block isApproved");

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      dashboard: {
        totalStudents,

        pendingApprovals,

        approvedStudents,

        occupancy: approvedStudents,

        recentStudents,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// EXPORT
// ==========================================

module.exports = {
  getDashboardData,
};
