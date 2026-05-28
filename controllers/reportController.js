const ExcelJS = require("exceljs");

const Complaint = require("../models/Complaint");
const User = require("../models/User");
const JobCard = require("../models/JobCard");
const MaterialRequest = require("../models/MaterialRequest");
const Inventory = require("../models/Inventory");


// Dashboard Report
const getDashboardReport = async (req, res) => {
  try {

    const totalComplaints =
      await Complaint.countDocuments();

    const openComplaints =
      await Complaint.countDocuments({
        status: "OPEN",
      });

    const completedComplaints =
      await Complaint.countDocuments({
        status: "COMPLETED",
      });

    const totalWorkers =
      await User.countDocuments({
        role: "WORKER",
      });

    const totalJobCards =
      await JobCard.countDocuments();

    const pendingMaterialRequests =
      await MaterialRequest.countDocuments({
        status: "PENDING",
      });

    const totalInventoryItems =
      await Inventory.countDocuments();

    res.status(200).json({
      success: true,
      dashboard: {
        totalComplaints,
        openComplaints,
        completedComplaints,
        totalWorkers,
        totalJobCards,
        pendingMaterialRequests,
        totalInventoryItems,
      },
    });

  } catch (error) {

    res.status(500).json({
      message: error.message,
    });

  }
};


// Export Complaints Excel
const exportComplaints = async (req, res) => {
  try {

    const complaints =
      await Complaint.find();

    const workbook =
      new ExcelJS.Workbook();

    const worksheet =
      workbook.addWorksheet(
        "Complaints"
      );

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
        header: "Priority",
        key: "priority",
        width: 15,
      },
      {
        header: "Status",
        key: "status",
        width: 20,
      },
      {
        header: "Created At",
        key: "createdAt",
        width: 25,
      },
    ];

    complaints.forEach((complaint) => {
      worksheet.addRow({
        complaintId:
          complaint.complaintId,

        title:
          complaint.title,

        priority:
          complaint.priority,

        status:
          complaint.status,

        createdAt:
          complaint.createdAt,
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=complaints.xlsx"
    );

    await workbook.xlsx.write(res);

    res.end();

  } catch (error) {

    res.status(500).json({
      message: error.message,
    });

  }
};


module.exports = {
  getDashboardReport,
  exportComplaints,
};