const JobCard = require("../../models/JobCard");

const Complaint = require("../../models/Complaint");

const sendNotification = require("../../utils/sendNotification");

const User = require("../../models/User");

// ==========================================
// GET ALL JOB CARDS
// ==========================================

exports.getAllJobCards = async (req, res) => {
  try {
    // ======================================
    // FILTER
    // ======================================

    let filter = {};

    // ======================================
    // WORKER CAN SEE ONLY OWN JOBS
    // ======================================

    if (req.user.role === "WORKER") {
      filter.assignedWorker = req.user._id;
    }

    // ======================================
    // FETCH JOB CARDS
    // ======================================

    const jobCards = await JobCard.find(filter)

      // ======================================
      // COMPLAINT DETAILS
      // ======================================

      .populate({
        path: "complaint",

        populate: {
          path: "createdBy",

          select: `
                name
                email
                phone
              `,
        },

        select: `
              complaintId
              title
               titleHindi
  description
  descriptionHindi
              category
              subCategory
              hostel
              floor
              block
              roomNumber
              priority
              status
              createdAt
              startedAt
            `,
      })

      // ======================================
      // WORKER DETAILS
      // ======================================

      .populate({
        path: "assignedWorker",

        select: `
              name
              department
              phone
              shift
              status
            `,
      })

      // ======================================
      // SORT
      // ======================================

      .sort({
        createdAt: -1,
      });
    console.log(
      "FIRST COMPLAINT =>",
      JSON.stringify(jobCards[0]?.complaint, null, 2),
    );

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      count: jobCards.length,

      message: "Job cards fetched successfully",

      jobCards,
    });
  } catch (error) {
    console.log("GET JOB CARDS ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to fetch job cards",
    });
  }
};

// ==========================================
// GET SINGLE JOB CARD
// ==========================================

exports.getSingleJobCard = async (req, res) => {
  try {
    // ======================================
    // FIND JOB CARD
    // ======================================

    const jobCard = await JobCard.findById(req.params.id)

      // ======================================
      // COMPLAINT
      // ======================================

      .populate({
        path: "complaint",

        populate: {
          path: "createdBy",

          select: `
                name
                email
                phone
              `,
        },

        select: `
              complaintId
              title
              titleHindi
  description
  descriptionHindi
              category
              subCategory
              hostel
              floor
              block
              roomNumber
              priority
              status
              createdAt
              startedAt
            `,
      })

      // ======================================
      // WORKER
      // ======================================

      .populate({
        path: "assignedWorker",

        select: `
              name
              department
              phone
              shift
              status
            `,
      });

    // ======================================
    // NOT FOUND
    // ======================================

    if (!jobCard) {
      return res.status(404).json({
        success: false,

        message: "Job card not found",
      });
    }

    // ======================================
    // WORKER SECURITY
    // ======================================

    if (
      req.user.role === "WORKER" &&
      jobCard.assignedWorker._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,

        message: "Access denied",
      });
    }

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      message: "Job card fetched successfully",

      jobCard,
    });
  } catch (error) {
    console.log("GET SINGLE JOB CARD ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to fetch job card",
    });
  }
};

// ==========================================
// UPDATE JOB STATUS
// ==========================================

exports.updateJobStatus = async (req, res) => {
  try {
    // ======================================
    // GET DATA
    // ======================================

    const { id } = req.params;

    const { status, remarks } = req.body;

    // ======================================
    // FIND JOB CARD
    // ======================================

    const jobCard = await JobCard.findById(id);

    if (!jobCard) {
      return res.status(404).json({
        success: false,

        message: "Job card not found",
      });
    }

    // ======================================
    // UPDATE STATUS
    // ======================================

    jobCard.status = status;

    jobCard.remarks = remarks || "";

    // ======================================
    // IN PROGRESS
    // ======================================

    if (status === "IN_PROGRESS") {
      jobCard.workerStatus = "WORKING";

      jobCard.startedAt = new Date();
    }

    // ======================================
    // MATERIAL REQUIRED
    // ======================================

    if (status === "MATERIAL_REQUIRED") {
      jobCard.workerStatus = "WAITING_MATERIAL";

      jobCard.materialRequired = true;
    }

    // ======================================
    // COMPLETED
    // ======================================

    if (status === "COMPLETED") {
      jobCard.workerStatus = "COMPLETED";

      jobCard.completionTime = new Date();

      if (jobCard.assignedWorker) {
        const worker = await User.findById(jobCard.assignedWorker);

        if (worker) {
          // ======================================
          // LIVE ACTIVE JOB COUNT
          // ======================================

          const activeJobs = await JobCard.countDocuments({
            assignedWorker: worker._id,

            status: {
              $in: ["ASSIGNED", "IN_PROGRESS", "MATERIAL_REQUIRED"],
            },
          });

          // ======================================
          // UPDATE STATUS
          // ======================================

          worker.status = activeJobs >= 10 ? "BUSY" : "ACTIVE";

          await worker.save();
        }
      }
    }

    // ======================================
    // SAVE JOB CARD
    // ======================================

    await jobCard.save();

    // ======================================
    // UPDATE COMPLAINT
    // ======================================

    const complaint = await Complaint.findById(jobCard.complaint);

    if (complaint) {
      complaint.status = status === "COMPLETED" ? "RESOLVED" : "IN_PROGRESS";

      await complaint.save();

      // ====================================
      // SEND NOTIFICATION
      // ====================================

      await sendNotification({
        receiver: complaint.createdBy,

        sender: req.user._id,

        title: "Complaint Status Updated",

        message: `Your complaint status is now ${status}`,

        type: "STATUS_UPDATE",

        relatedComplaint: complaint._id,
      });
    }

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      message: "Job status updated successfully",

      jobCard,
    });
  } catch (error) {
    console.log("UPDATE JOB STATUS ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to update status",
    });
  }
};

// ==========================================
// DELETE JOB CARD
// ==========================================

exports.deleteJobCard = async (req, res) => {
  try {
    // ======================================
    // FIND JOB CARD
    // ======================================

    const jobCard = await JobCard.findById(req.params.id);

    // ======================================
    // NOT FOUND
    // ======================================

    if (!jobCard) {
      return res.status(404).json({
        success: false,

        message: "Job card not found",
      });
    }

    // ======================================
    // DELETE
    // ======================================

    await JobCard.findByIdAndDelete(req.params.id);

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      message: "Job card deleted successfully",
    });
  } catch (error) {
    console.log("DELETE JOB CARD ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Failed to delete job card",
    });
  }
};
