const Complaint = require("../../models/Complaint");

// ==========================================
// GET OVERDUE COMPLAINTS
// ==========================================

exports.getOverdueComplaints = async (req, res) => {
  try {
    // ======================================
    // 24 HOURS FILTER
    // ======================================

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // ======================================
    // FETCH COMPLAINTS
    // ======================================

    const complaints = await Complaint.find({
      createdAt: {
        $lte: twentyFourHoursAgo,
      },

      status: {
        $in: ["PENDING", "ASSIGNED", "IN_PROGRESS", "MATERIAL_REQUIRED"],
      },
    })

      .populate({
        path: "assignedTo",

        select: `
            name
            department
            phone
            shift
            employeeId
          `,
      })

      .sort({
        createdAt: -1,
      });

    // ======================================
    // CURRENT TIME
    // ======================================

    const currentTime = new Date();

    // ======================================
    // FORMAT DATA
    // ======================================

    const formattedData = complaints.map((complaint) => {
      // ==================================
      // TIME DIFFERENCE
      // ==================================

      const createdAt = new Date(complaint.createdAt);

      const diffMs = currentTime - createdAt;

      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

      const diffDays = Math.floor(diffHours / 24);

      // ==================================
      // ESCALATION
      // ==================================

      let escalationLevel = "LEVEL 1";

      let overdueStatus = "OVERDUE";

      if (diffHours >= 48) {
        escalationLevel = "LEVEL 2";
      }

      if (diffHours >= 72) {
        escalationLevel = "LEVEL 3";

        overdueStatus = "CRITICAL_OVERDUE";
      }

      // ==================================
      // RETURN
      // ==================================

      return {
        _id: complaint._id,

        complaintId: complaint.complaintId,

        title: complaint.title,

        description: complaint.description,

        category: complaint.category,

        subCategory: complaint.subCategory,

        building: complaint.hostel,

        room: complaint.roomNumber,

        priority: complaint.priority,

        complaintStatus: complaint.status,

        worker: complaint?.assignedTo?.name || "Not Assigned",

        workerPhone: complaint?.assignedTo?.phone || "N/A",

        workerShift: complaint?.assignedTo?.shift || "N/A",

        employeeId: complaint?.assignedTo?.employeeId || "N/A",

        department: complaint?.assignedTo?.department || "GENERAL",

        overdueDuration: `${diffHours} Hours`,

        pendingSince: `${diffDays} Days`,

        escalationLevel,

        overdueStatus,

        createdAt: complaint.createdAt,
      };
    });

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      count: formattedData.length,

      complaints: formattedData,
    });
  } catch (error) {
    console.log("GET OVERDUE ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to fetch overdue complaints",
    });
  }
};

// ==========================================
// GET SINGLE OVERDUE
// ==========================================

exports.getSingleOverdueComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id).populate({
      path: "assignedTo",

      select: `
          name
          phone
          department
          shift
          employeeId
        `,
    });

    if (!complaint) {
      return res.status(404).json({
        success: false,

        message: "Complaint not found",
      });
    }

    return res.status(200).json({
      success: true,

      complaint,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,

      message: "Failed to fetch complaint",
    });
  }
};

// ==========================================
// ESCALATE
// ==========================================

exports.escalateComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({
        success: false,

        message: "Complaint not found",
      });
    }

    // ==================================
    // UPDATE
    // ==================================

    complaint.escalated = true;

    complaint.escalationTime = new Date();

    complaint.overdueStatus = "ESCALATED";

    await complaint.save();

    // ==================================
    // RESPONSE
    // ==================================

    return res.status(200).json({
      success: true,

      message: "Complaint escalated successfully",
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,

      message: "Failed to escalate complaint",
    });
  }
};
