const express = require("express");

const router = express.Router();

const User = require("../../models/User");

const Complaint = require("../../models/Complaint");

// ==========================================
// COMMON TEST ROUTE
// ==========================================

router.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Common routes working",
  });
});

// ==========================================
// PUBLIC LANDING PAGE STATS
// NO LOGIN REQUIRED
// ==========================================

router.get("/landing-stats", async (req, res) => {
  try {
    // ======================================
    // TODAY START
    // ======================================

    const startOfToday = new Date();

    startOfToday.setHours(0, 0, 0, 0);

    // ======================================
    // TODAY END
    // ======================================

    const endOfToday = new Date();

    endOfToday.setHours(23, 59, 59, 999);

    // ======================================
    // FETCH STATS
    // ======================================

    const [
      totalStudents,
      activeStudents,
      activeWardens,
      openComplaints,
      resolvedToday,
      totalResolved,
    ] = await Promise.all([
      // ====================================
      // TOTAL STUDENTS
      // ====================================

      User.countDocuments({
        role: "STUDENT",
      }),

      // ====================================
      // ACTIVE STUDENTS
      // ====================================

      User.countDocuments({
        role: "STUDENT",
        isActive: true,
      }),

      // ====================================
      // ACTIVE WARDENS
      // ====================================

      User.countDocuments({
        role: "WARDEN",
        isActive: true,
      }),

      // ====================================
      // OPEN COMPLAINTS
      // ====================================

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

      // ====================================
      // RESOLVED TODAY
      // ====================================

      Complaint.countDocuments({
        status: {
          $in: ["RESOLVED", "CLOSED"],
        },

        $or: [
          {
            resolvedAt: {
              $gte: startOfToday,
              $lte: endOfToday,
            },
          },

          {
            closedAt: {
              $gte: startOfToday,
              $lte: endOfToday,
            },
          },
        ],
      }),

      // ====================================
      // TOTAL RESOLVED
      // ====================================

      Complaint.countDocuments({
        status: {
          $in: ["RESOLVED", "CLOSED"],
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
        activeWardens,
        openComplaints,
        resolvedToday,
        totalResolved,
      },
    });
  } catch (error) {
    console.log("LANDING STATS ERROR:", error);

    return res.status(500).json({
      success: false,

      message: error.message || "Failed to load landing statistics",
    });
  }
});

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
