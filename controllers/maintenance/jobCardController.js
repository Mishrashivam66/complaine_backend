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
        path: "complaints.complaint",

        populate: {
          path: "createdBy",
          select: "name email phone",
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
      "FIRST JOB CARD =>",
      JSON.stringify(jobCards[0]?.complaints, null, 2),
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
      // COMPLAINTS
      // ======================================

      .populate({
        path: "complaints.complaint",

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

    const { complaintId, status, remarks } = req.body;

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

    const complaintItem = jobCard.complaints.find(
      (item) => item.complaint.toString() === complaintId,
    );

    if (!complaintItem) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found in this Job Card",
      });
    }
    // ======================================
    // IN PROGRESS
    // ======================================

    if (status === "IN_PROGRESS") {
      jobCard.workerStatus = "WORKING";
      complaintItem.status = "IN_PROGRESS";

      complaintItem.startedAt = new Date();

      jobCard.workerStatus = "WORKING";
    }

    // ======================================
    // MATERIAL REQUIRED
    // ======================================

    if (status === "WAITING_MATERIAL") {
      jobCard.workerStatus = "WAITING_MATERIAL";

      complaintItem.status = "WAITING_MATERIAL";

      complaintItem.materialRequired = true;

      complaintItem.materialStatus = "PENDING";

      jobCard.workerStatus = "WAITING_MATERIAL";
    }

    // ======================================
    // COMPLETED
    // ======================================

    if (status === "COMPLETED") {
      complaintItem.status = "COMPLETED";

      complaintItem.completedAt = new Date();

      const allCompleted = jobCard.complaints.every(
        (item) => item.status === "COMPLETED",
      );

      if (allCompleted) {
        jobCard.workerStatus = "COMPLETED";
        jobCard.completedAt = new Date();
        jobCard.isCompleted = true;

        if (jobCard.assignedWorker) {
          const worker = await User.findById(jobCard.assignedWorker);

          if (worker) {
            const activeJobs = await JobCard.countDocuments({
              assignedWorker: worker._id,
              isCompleted: false,
            });

            worker.status = activeJobs >= 10 ? "BUSY" : "ACTIVE";

            await worker.save();
          }
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
    const complaint = await Complaint.findById(complaintId);

    if (complaint) {
      if (status === "COMPLETED") {
        complaint.status = "RESOLVED";
      } else if (status === "WAITING_MATERIAL") {
        complaint.status = "WAITING_MATERIAL";
      } else {
        complaint.status = "IN_PROGRESS";
      }

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
