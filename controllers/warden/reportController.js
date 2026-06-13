const Report = require("../../models/Report");

// ==========================================
// CREATE REPORT
// ==========================================

const createReport = async (req, res) => {
  try {
    const {
      title,

      category,

      remarks,
    } = req.body;

    // ==========================================
    // VALIDATION
    // ==========================================

    if (!title || !category) {
      return res.status(400).json({
        success: false,

        message: "Title and category are required",
      });
    }

    // ==========================================
    // HOSTEL
    // ==========================================

    const hostel = req.user.assignedHostel || req.user.hostel;

    // ==========================================
    // CREATE REPORT
    // ==========================================

    const report = await Report.create({
      title,

      category,

      remarks,

      hostel,

      generatedBy: req.user.name,

      status: "GENERATED",
    });

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(201).json({
      success: true,

      message: "Report generated successfully",

      report,
    });
  } catch (error) {
    console.log("CREATE REPORT ERROR:", error);

    res.status(500).json({
      success: false,

      message: "Failed to generate report",
    });
  }
};

// ==========================================
// GET ALL REPORTS
// ==========================================

const getReports = async (req, res) => {
  try {
    // ==========================================
    // HOSTEL
    // ==========================================

    const hostel = req.user.assignedHostel || req.user.hostel;

    // ==========================================
    // FETCH REPORTS
    // ==========================================

    const reports = await Report.find({
      hostel,
    }).sort({
      createdAt: -1,
    });

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      count: reports.length,

      reports,
    });
  } catch (error) {
    console.log("GET REPORTS ERROR:", error);

    res.status(500).json({
      success: false,

      message: "Failed to fetch reports",
    });
  }
};

// ==========================================
// GET SINGLE REPORT
// ==========================================

const getSingleReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);

    // ==========================================
    // CHECK
    // ==========================================

    if (!report) {
      return res.status(404).json({
        success: false,

        message: "Report not found",
      });
    }

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      report,
    });
  } catch (error) {
    console.log("GET SINGLE REPORT ERROR:", error);

    res.status(500).json({
      success: false,

      message: "Failed to fetch report",
    });
  }
};

// ==========================================
// DELETE REPORT
// ==========================================

const deleteReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);

    // ==========================================
    // CHECK
    // ==========================================

    if (!report) {
      return res.status(404).json({
        success: false,

        message: "Report not found",
      });
    }

    // ==========================================
    // DELETE
    // ==========================================

    await report.deleteOne();

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      message: "Report deleted successfully",
    });
  } catch (error) {
    console.log("DELETE REPORT ERROR:", error);

    res.status(500).json({
      success: false,

      message: "Failed to delete report",
    });
  }
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  createReport,

  getReports,

  getSingleReport,

  deleteReport,
};
