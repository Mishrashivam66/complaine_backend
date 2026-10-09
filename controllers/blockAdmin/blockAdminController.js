const Complaint = require("../../models/Complaint");

// ==========================================
// GET BLOCK COMPLAINTS - READ ONLY
// ==========================================

exports.getBlockComplaints = async (req, res) => {
  try {
    const block = req.user.assignedBlock;

    if (!block) {
      return res.status(403).json({
        success: false,
        message: "No block assigned to this admin",
      });
    }

    const filter = {
      complaintArea: "DEPARTMENT",
      block: block,
    };

    const complaints = await Complaint.find(filter)
      .select("-statusHistory")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .lean();

    const statusCounts = {};

    for (const complaint of complaints) {
      statusCounts[complaint.status] =
        (statusCounts[complaint.status] || 0) + 1;
    }

    return res.status(200).json({
      success: true,
      block,
      totalComplaints: complaints.length,
      statusCounts,
      complaints,
    });
  } catch (error) {
    console.error("BLOCK COMPLAINT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
