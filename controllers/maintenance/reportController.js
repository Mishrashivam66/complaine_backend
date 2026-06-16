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
    // RESOLVED COMPLAINTS
    // ==========================================

    const resolvedComplaints = await Complaint.countDocuments({
      status: {
        $in: ["RESOLVED", "COMPLETED", "CLOSED"],
      },
    });

    // ==========================================
    // REOPENED CASES
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
    // TODAY COMPLAINTS
    // ==========================================

    const startOfToday = new Date();

    startOfToday.setHours(0, 0, 0, 0);

    const todayComplaints = await Complaint.countDocuments({
      createdAt: {
        $gte: startOfToday,
      },
    });

    // ==========================================
    // MONTHLY COMPLAINTS
    // ==========================================

    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    );

    const monthlyComplaints = await Complaint.countDocuments({
      createdAt: {
        $gte: startOfMonth,
      },
    });

    // ==========================================
    // RESOLUTION RATE
    // ==========================================

    let resolutionRate = 0;

    if (totalComplaints > 0) {
      resolutionRate = Math.round((resolvedComplaints / totalComplaints) * 100);
    }

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
    // CATEGORY ANALYTICS
    // ==========================================

    const categoryData = await Complaint.aggregate([
      {
        $group: {
          _id: "$category",

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
    // ACTIVE COMPLAINTS
    // ==========================================

    const activeComplaints = await Complaint.countDocuments({
      status: {
        $in: ["PENDING", "ASSIGNED", "IN_PROGRESS"],
      },
    });

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
          workerId: worker._id,

          name: worker.name,

          department: worker.department || "N/A",

          totalJobs,

          completedJobs,

          efficiency,
        };
      }),
    );

    // ==========================================
    // TOP WORKER
    // ==========================================

    const topWorker =
      workerEfficiency.length > 0
        ? workerEfficiency.sort((a, b) => b.efficiency - a.efficiency)[0]
        : null;

    // ==========================================
    // RESPONSE
    // ==========================================

    return res.status(200).json({
      success: true,

      report: {
        totalComplaints,

        resolvedComplaints,

        activeComplaints,

        overdueIssues,

        reopenedCases,

        todayComplaints,

        monthlyComplaints,

        resolutionRate,

        buildingData,

        categoryData,

        workerEfficiency,

        topWorker,
      },
    });
  } catch (error) {
    console.log("REPORT ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to load reports",
    });
  }
};
// ==========================================
// EXPORT PDF REPORT
// ==========================================

exports.exportPDFReport = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: "PDF Export Coming Soon",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "PDF Export Failed",
    });
  }
};

// ==========================================
// EXPORT EXCEL REPORT
// ==========================================

exports.exportExcelReport = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: "Excel Export Coming Soon",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Excel Export Failed",
    });
  }
};

// ==========================================
// EXPORT CSV REPORT
// ==========================================

exports.exportCSVReport = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: "CSV Export Coming Soon",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "CSV Export Failed",
    });
  }
};
