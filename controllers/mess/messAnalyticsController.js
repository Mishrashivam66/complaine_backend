const MessComplaint = require("../../models/MessComplaint");

// ==========================================
// GET MESS ANALYTICS
// ==========================================

const getMessAnalytics = async (req, res) => {
  try {
    // ==========================================
    // TOTAL COMPLAINTS
    // ==========================================

    const totalComplaints = await MessComplaint.countDocuments();

    // ==========================================
    // STATUS COUNTS
    // ==========================================

    const pending = await MessComplaint.countDocuments({
      status: "PENDING",
    });

    const resolved = await MessComplaint.countDocuments({
      status: "RESOLVED",
    });

    const inProgress = await MessComplaint.countDocuments({
      status: "IN_PROGRESS",
    });

    // ==========================================
    // CATEGORY STATS
    // ==========================================

    const categoryStats = await MessComplaint.aggregate([
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
    // AVG RATING
    // ==========================================

    const ratingData = await MessComplaint.aggregate([
      {
        $group: {
          _id: null,

          averageRating: {
            $avg: "$rating",
          },
        },
      },
    ]);

    const averageRating = ratingData[0]?.averageRating || 0;

    // ==========================================
    // FOOD RATINGS
    // ==========================================

    const foodRatings = await MessComplaint.aggregate([
      {
        $group: {
          _id: "$foodItem",

          averageRating: {
            $avg: "$rating",
          },

          totalRatings: {
            $sum: 1,
          },
        },
      },

      {
        $sort: {
          averageRating: -1,
        },
      },
    ]);

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      analytics: {
        totalComplaints,

        pending,

        resolved,

        inProgress,

        averageRating: averageRating.toFixed(1),

        categoryStats,

        foodRatings,
      },
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to fetch analytics",
    });
  }
};

// ==========================================
// EXPORT
// ==========================================

module.exports = {
  getMessAnalytics,
};
