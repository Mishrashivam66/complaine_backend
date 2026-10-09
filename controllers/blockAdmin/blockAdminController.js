const Complaint = require("../../models/Complaint");

// ==========================================
// GET BLOCK ADMIN COMPLAINTS
// ==========================================

exports.getBlockComplaints = async (req, res) => {
  try {
    // Block Admin must be authenticated
    const user = req.user;

    if (!user || user.role !== "BLOCK_ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Get assigned block from logged-in user
    const assignedBlock = String(user.assignedBlock || "")
      .trim()
      .toUpperCase();

    const validBlocks = ["A", "B", "C", "D", "E", "F"];

    if (!validBlocks.includes(assignedBlock)) {
      return res.status(403).json({
        success: false,
        message: "No valid block assigned to your account",
      });
    }

    // Supports both "A" and "A Block" formats
    const blockRegex = new RegExp(`^${assignedBlock}(?:\\s+BLOCK)?$`, "i");

    // ==========================================
    // FETCH ONLY ASSIGNED BLOCK COMPLAINTS
    // ==========================================

    const complaints = await Complaint.find({
      complaintArea: "DEPARTMENT",
      block: blockRegex,
    })
      .select("-statusHistory")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .lean();

    // ==========================================
    // STATUS COUNTS
    // ==========================================

    const statusCounts = {
      PENDING: 0,
      ASSIGNED: 0,
      IN_PROGRESS: 0,
      WAITING_MATERIAL: 0,
      COMPLETED: 0,
      RESOLVED: 0,
      CLOSED: 0,
      REOPENED: 0,
    };

    for (const complaint of complaints) {
      const status = complaint.status;

      if (Object.prototype.hasOwnProperty.call(statusCounts, status)) {
        statusCounts[status] += 1;
      }
    }

    return res.status(200).json({
      success: true,
      block: assignedBlock,
      totalComplaints: complaints.length,
      statusCounts,
      complaints,
    });
  } catch (error) {
    console.error("BLOCK ADMIN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch department complaints",
    });
  }
};
