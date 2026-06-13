const User = require("../../models/User");

const JobCard = require("../../models/JobCard");

const Complaint = require("../../models/Complaint");

// ==========================================
// GET WORKER PERFORMANCE
// ==========================================

exports.getWorkerPerformance = async (req, res) => {
  try {
    // ======================================
    // GET ALL WORKERS
    // ======================================

    const workers = await User.find({
      role: "WORKER",
    });

    // ======================================
    // PERFORMANCE DATA
    // ======================================

    const performanceData = await Promise.all(
      workers.map(async (worker) => {
        // ==================================
        // ASSIGNED JOBS
        // ==================================

        const assignedJobs = await JobCard.countDocuments({
          assignedWorker: worker._id,
        });

        // ==================================
        // COMPLETED JOBS
        // ==================================

        const completedJobs = await JobCard.countDocuments({
          assignedWorker: worker._id,

          status: {
            $in: ["COMPLETED", "CLOSED", "RESOLVED"],
          },
        });

        // ==================================
        // PENDING JOBS
        // ==================================

        const pendingJobs = await JobCard.countDocuments({
          assignedWorker: worker._id,

          status: {
            $in: ["ASSIGNED", "IN_PROGRESS", "MATERIAL_REQUIRED"],
          },
        });

        // ==================================
        // REOPENED COMPLAINTS
        // ==================================

        const reopenedComplaints = await Complaint.countDocuments({
          assignedTo: worker._id,

          reopenCount: {
            $gt: 0,
          },
        });

        // ==================================
        // PERFORMANCE SCORE
        // ==================================

        let performanceScore = 0;

        if (assignedJobs > 0) {
          performanceScore = Math.round((completedJobs / assignedJobs) * 100);
        }

        // ==================================
        // RATING
        // ==================================

        let rating = (performanceScore / 20).toFixed(1);

        // ==================================
        // STATUS
        // ==================================

        let performanceStatus = "AVERAGE";

        if (performanceScore >= 85) {
          performanceStatus = "TOP_PERFORMER";
        } else if (performanceScore <= 40) {
          performanceStatus = "LOW_PERFORMANCE";
        }

        // ==================================
        // WORKER STATUS
        // ==================================

        const workerStatus = worker.status || "ACTIVE";

        // ==================================
        // EFFICIENCY
        // ==================================

        const efficiency =
          assignedJobs > 0
            ? Math.round((completedJobs / assignedJobs) * 100)
            : 0;

        // ==================================
        // RETURN
        // ==================================

        return {
          id: worker.employeeId || `WRK-${worker._id.toString().slice(-4)}`,

          _id: worker._id,

          name: worker.name,

          department: worker.department || "GENERAL",

          shift: worker.shift || "DAY",

          workerStatus,

          assignedJobs,

          completedJobs,

          pendingJobs,

          reopenedComplaints,

          performanceScore,

          efficiency,

          rating,

          status: performanceStatus,
        };
      }),
    );

    // ======================================
    // SORT TOP PERFORMERS
    // ======================================

    performanceData.sort((a, b) => b.performanceScore - a.performanceScore);

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      totalWorkers: performanceData.length,

      workers: performanceData,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,

      message: "Failed to fetch worker performance",
    });
  }
};
