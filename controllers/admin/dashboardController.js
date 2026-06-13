const User = require("../../models/User");

const Complaint = require("../../models/Complaint");

const Hostel = require("../../models/Hostel");

const AuditLog = require("../../models/AuditLog");

// ======================================
// ADMIN DASHBOARD
// ======================================

exports.getDashboardStats = async (req, res) => {
  try {
    // ======================================
    // USER STATS
    // ======================================

    const totalStudents = await User.countDocuments({
      role: "STUDENT",
    });

    const totalWardens = await User.countDocuments({
      role: "WARDEN",
    });

    // ======================================
    // HOSTELS
    // ======================================

    const totalHostels = await Hostel.countDocuments();

    // ======================================
    // COMPLAINTS
    // ======================================

    const totalComplaints = await Complaint.countDocuments();

    // ======================================
    // PENDING
    // ======================================

    const pendingComplaints = await Complaint.countDocuments({
      status: "PENDING",
    });

    // ======================================
    // IN PROGRESS
    // ======================================

    const inProgressComplaints = await Complaint.countDocuments({
      status: {
        $in: ["ASSIGNED", "IN_PROGRESS"],
      },
    });

    // ======================================
    // RESOLVED
    // ======================================

    const resolvedComplaints = await Complaint.countDocuments({
      status: {
        $in: ["RESOLVED", "CLOSED"],
      },
    });

    // ======================================
    // OVERDUE
    // ======================================

    const overdueComplaints = await Complaint.countDocuments({
      priority: "URGENT",

      status: {
        $nin: ["RESOLVED", "CLOSED"],
      },
    });

    // ======================================
    // RECENT ACTIVITIES
    // ======================================

    const recentActivities = await AuditLog.find()

      .sort({
        createdAt: -1,
      })

      .limit(5);

    // ======================================
    // RESPONSE
    // ======================================

    res.status(200).json({
      success: true,

      stats: {
        totalStudents,

        totalWardens,

        totalHostels,

        totalComplaints,

        pendingComplaints,

        inProgressComplaints,

        resolvedComplaints,

        overdueComplaints,
      },

      recentActivities,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Dashboard fetch failed",
    });
  }
};
