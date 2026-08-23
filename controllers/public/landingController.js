const User = require("../../models/User");
const Complaint = require("../../models/Complaint");

// ==========================================
// PUBLIC LANDING PAGE STATS
// ==========================================

exports.getLandingStats = async (req, res) => {
  try {
    // ======================================
    // TODAY START / END
    // ======================================

    const startOfToday = new Date();

    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();

    endOfToday.setHours(23, 59, 59, 999);

    // ======================================
    // PARALLEL QUERIES
    // ======================================

    const [
      totalStudents,
      activeStudents,
      totalWardens,
      openComplaints,
      completedToday,
      totalCompleted,
    ] = await Promise.all([
      // TOTAL STUDENTS
      User.countDocuments({
        role: "STUDENT",
      }),

      // ACTIVE STUDENTS
      User.countDocuments({
        role: "STUDENT",
        isActive: true,
      }),

      // WARDENS
      User.countDocuments({
        role: "WARDEN",
        isActive: true,
      }),

      // OPEN COMPLAINTS
      Complaint.countDocuments({
        status: {
          $in: [
            "PENDING",
            "ASSIGNED",
            "IN_PROGRESS",
            "WAITING_MATERIAL",
            "REOPENED",
          ],
        },
      }),

      // COMPLETED TODAY
      Complaint.countDocuments({
        status: "COMPLETED",

        completedAt: {
          $gte: startOfToday,
          $lte: endOfToday,
        },
      }),

      // TOTAL COMPLETED
      Complaint.countDocuments({
        status: {
          $in: ["COMPLETED", "RESOLVED", "CLOSED"],
        },
      }),
    ]);

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      stats: {
        totalStudents,
        activeStudents,
        activeWardens: totalWardens,
        openComplaints,
        completedToday,
        totalCompleted,
      },
    });
  } catch (error) {
    console.log("LANDING STATS ERROR:", error);

    return res.status(500).json({
      success: false,

      message: error.message || "Failed to load campus statistics",
    });
  }
};
