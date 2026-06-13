const Complaint = require("../../models/Complaint");

const User = require("../../models/User");

const JobCard = require("../../models/JobCard");

// ==========================================
// GET REPORTS
// ==========================================

exports.getReports = async (req, res) => {
  try {
    // ==========================================
    // TOTAL COMPLAINTS
    // ==========================================

    const totalComplaints = await Complaint.countDocuments();

    // ==========================================
    // RESOLVED
    // ==========================================

    const resolvedComplaints = await Complaint.countDocuments({
      status: {
        $in: ["RESOLVED", "COMPLETED", "CLOSED"],
      },
    });

    // ==========================================
    // REOPENED
    // ==========================================

    const reopenedCases = await Complaint.countDocuments({
      reopenCount: {
        $gt: 0,
      },
    });

    // ==========================================
    // OVERDUE ISSUES
    // ==========================================

    const overdueIssues = await JobCard.countDocuments({
      status: {
        $in: ["ASSIGNED", "IN_PROGRESS", "MATERIAL_REQUIRED"],
      },

      createdAt: {
        $lte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    // ==========================================
    // BUILDING ANALYTICS
    // ==========================================

    const buildingData = await Complaint.aggregate([
      {
        $group: {
          _id: "$hostel",

          total: {
            $sum: 1,
          },
        },
      },

      {
        $sort: {
          total: -1,
        },
      },
    ]);

    // ==========================================
    // WORKER PERFORMANCE
    // ==========================================

    const workers = await User.find({
      role: "WORKER",
    });

    const workerEfficiency = await Promise.all(
      workers.map(async (worker) => {
        const totalJobs = await JobCard.countDocuments({
          assignedWorker: worker._id,
        });

        const completedJobs = await JobCard.countDocuments({
          assignedWorker: worker._id,

          status: "COMPLETED",
        });

        let efficiency = 0;

        if (totalJobs > 0) {
          efficiency = Math.round((completedJobs / totalJobs) * 100);
        }

        return {
          name: worker.name,

          efficiency,
        };
      }),
    );

    // ==========================================
    // RESPONSE
    // ==========================================

    return res.status(200).json({
      success: true,

      report: {
        totalComplaints,

        resolvedComplaints,

        overdueIssues,

        reopenedCases,

        buildingData,

        workerEfficiency,
      },
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,

      message: "Failed to load reports",
    });
  }
};
