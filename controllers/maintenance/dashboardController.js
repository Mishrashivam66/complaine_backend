const Complaint = require("../../models/Complaint");

const User = require("../../models/User");

const JobCard = require("../../models/JobCard");

// ==========================================
// GET MAINTENANCE DASHBOARD
// ==========================================

exports.getMaintenanceDashboard = async (req, res) => {
  try {
    // ======================================
    // TOTAL COMPLAINTS
    // ======================================

    const totalComplaints = await Complaint.countDocuments();

    const totalJobCards = await JobCard.countDocuments();

    const activeJobCards = await JobCard.countDocuments({
      isCompleted: false,
    });
    // ======================================
    // PENDING
    // ======================================

    const pendingComplaints = await Complaint.countDocuments({
      status: "PENDING",
    });

    const inProgressJobCards = await JobCard.countDocuments({
      status: {
        $in: ["IN_PROGRESS", "PARTIALLY_COMPLETED", "WAITING_MATERIAL"],
      },
    });

    // ======================================
    // IN PROGRESS
    // ======================================

    const inProgressComplaints = await Complaint.countDocuments({
      status: "IN_PROGRESS",
    });

    // ======================================
    // RESOLVED
    // ======================================

    const resolvedComplaints = await Complaint.countDocuments({
      status: {
        $in: ["RESOLVED", "COMPLETED", "CLOSED"],
      },
    });

    const waitingMaterialJobCards = await JobCard.countDocuments({
      status: "WAITING_MATERIAL",
    });

    const verificationPendingJobCards = await JobCard.countDocuments({
      status: "READY_FOR_VERIFICATION",
    });

    // ======================================
    // OVERDUE
    // ======================================

    const overdueComplaints = await Complaint.countDocuments({
      deadline: {
        $exists: true,
        $lt: new Date(),
      },
      status: {
        $nin: ["RESOLVED", "COMPLETED", "CLOSED"],
      },
    });
    const completedJobCards = await JobCard.countDocuments({
      isCompleted: true,
    });
    // ======================================
    // ACTIVE WORKERS
    // ======================================

    const activeWorkers = await User.countDocuments({
      role: "WORKER",

      status: "ACTIVE",
    });

    // ======================================
    // BUSY WORKERS
    // ======================================

    const busyWorkers = await User.countDocuments({
      role: "WORKER",

      status: "BUSY",
    });

    // ======================================
    // OFFLINE WORKERS
    // ======================================

    const offlineWorkers = await User.countDocuments({
      role: "WORKER",

      status: "OFFLINE",
    });

    // ======================================
    // RECENT COMPLAINTS
    // ======================================

    const recentComplaints = await Complaint.find()

      .sort({
        createdAt: -1,
      })

      .limit(5)

      .select(
        `
            complaintId
            title
            hostel
            roomNumber
            status
            priority
            category
          `,
      );

    // ======================================
    // RESOLUTION RATE
    // ======================================

    let resolutionRate = 0;

    if (totalComplaints > 0) {
      resolutionRate = Math.round((resolvedComplaints / totalComplaints) * 100);
    }

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,
      dashboard: {
        totalComplaints,
        pendingComplaints,
        inProgressComplaints,
        resolvedComplaints,
        overdueComplaints,

        totalJobCards,
        activeJobCards,
        inProgressJobCards,
        completedJobCards,

        activeWorkers,
        busyWorkers,
        offlineWorkers,

        resolutionRate,
        recentComplaints,

        waitingMaterialJobCards,
        verificationPendingJobCards,
      },
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,

      message: "Failed to load dashboard",
    });
  }
};
