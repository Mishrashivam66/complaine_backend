const Complaint = require("../../models/Complaint");
const ExcelJS = require("exceljs");

const PDFDocument = require("pdfkit");
// ======================================
// OVERALL REPORT
// ======================================

const getReports = async (req, res) => {
  try {
    // ======================================
    // TOTAL COUNTS
    // ======================================

    const totalComplaints = await Complaint.countDocuments();

    const pendingComplaints = await Complaint.countDocuments({
      status: "PENDING",
    });

    const assignedComplaints = await Complaint.countDocuments({
      status: "ASSIGNED",
    });

    const resolvedComplaints = await Complaint.countDocuments({
      status: "RESOLVED",
    });

    const closedComplaints = await Complaint.countDocuments({
      status: "CLOSED",
    });

    const reopenedComplaints = await Complaint.countDocuments({
      status: "REOPENED",
    });

    const escalatedComplaints = await Complaint.countDocuments({
      isEscalated: true,
    });

    // ======================================
    // OVERDUE
    // ======================================

    const allComplaints = await Complaint.find();

    const overdueComplaints = allComplaints.filter((item) => {
      if (item.status === "RESOLVED" || item.status === "CLOSED") {
        return false;
      }

      const created = new Date(item.createdAt).getTime();

      const current = Date.now();

      const hours = (current - created) / (1000 * 60 * 60);

      return hours >= 24;
    });

    // ======================================
    // CATEGORY WISE
    // ======================================

    const categoryReport = await Complaint.aggregate([
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

    // ======================================
    // STATUS WISE
    // ======================================

    const statusReport = await Complaint.aggregate([
      {
        $group: {
          _id: "$status",

          total: {
            $sum: 1,
          },
        },
      },
    ]);

    // ======================================
    // HOSTEL WISE
    // ======================================

    const hostelReport = await Complaint.aggregate([
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

    // ======================================
    // MONTHLY REPORT
    // ======================================

    const monthlyReport = await Complaint.aggregate([
      {
        $group: {
          _id: {
            month: {
              $month: "$createdAt",
            },

            year: {
              $year: "$createdAt",
            },
          },

          total: {
            $sum: 1,
          },
        },
      },

      {
        $sort: {
          "_id.year": 1,

          "_id.month": 1,
        },
      },
    ]);

    // ======================================
    // PRIORITY REPORT
    // ======================================

    const priorityReport = await Complaint.aggregate([
      {
        $group: {
          _id: "$priority",

          total: {
            $sum: 1,
          },
        },
      },
    ]);

    // ======================================
    // RESPONSE
    // ======================================

    res.status(200).json({
      success: true,

      reports: {
        totalComplaints,

        pendingComplaints,

        assignedComplaints,

        resolvedComplaints,

        closedComplaints,

        reopenedComplaints,

        escalatedComplaints,

        overdueComplaints: overdueComplaints.length,

        categoryReport,

        statusReport,

        hostelReport,

        monthlyReport,

        priorityReport,
      },
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};
// ======================================
// EXPORT EXCEL
// ======================================

const exportExcelReport = async (req, res) => {
  try {
    const complaints = await Complaint.find();

    const workbook = new ExcelJS.Workbook();

    const worksheet = workbook.addWorksheet("Complaint Reports");

    // ======================================
    // HEADERS
    // ======================================

    worksheet.columns = [
      {
        header: "Complaint ID",

        key: "complaintId",

        width: 20,
      },

      {
        header: "Title",

        key: "title",

        width: 30,
      },

      {
        header: "Category",

        key: "category",

        width: 20,
      },

      {
        header: "Priority",

        key: "priority",

        width: 20,
      },

      {
        header: "Status",

        key: "status",

        width: 20,
      },

      {
        header: "Hostel",

        key: "hostel",

        width: 15,
      },
    ];

    // ======================================
    // ROWS
    // ======================================

    complaints.forEach((item) => {
      worksheet.addRow({
        complaintId: item.complaintId,

        title: item.title,

        category: item.category,

        priority: item.priority,

        status: item.status,

        hostel: item.hostel,
      });
    });

    // ======================================
    // RESPONSE
    // ======================================

    res.setHeader(
      "Content-Type",

      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader(
      "Content-Disposition",

      "attachment; filename=reports.xlsx",
    );

    await workbook.xlsx.write(res);

    res.end();
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ======================================
// EXPORT PDF
// ======================================

const exportPDFReport = async (req, res) => {
  try {
    const complaints = await Complaint.find();

    const doc = new PDFDocument();

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader("Content-Disposition", "attachment; filename=reports.pdf");

    doc.pipe(res);

    // ======================================
    // TITLE
    // ======================================

    doc.fontSize(24).text("Smart Campus ERP Reports");

    doc.moveDown();

    // ======================================
    // DATA
    // ======================================

    complaints.forEach((item, index) => {
      doc.fontSize(14).text(`${index + 1}. ${item.complaintId}`);

      doc.text(`Title: ${item.title}`);

      doc.text(`Category: ${item.category}`);

      doc.text(`Priority: ${item.priority}`);

      doc.text(`Status: ${item.status}`);

      doc.text(`Hostel: ${item.hostel}`);

      doc.moveDown();
    });

    doc.end();
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

module.exports = {
  getReports,

  exportExcelReport,

  exportPDFReport,
};
