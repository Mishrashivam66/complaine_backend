const JobCard = require("../../models/JobCard");
const Complaint = require("../../models/Complaint");
const MaterialRequest = require("../../models/MaterialRequest");
const User = require("../../models/User");
// ==========================================
// CREATE GROUPED JOB CARD
// ==========================================
const sendNotification = require("../../utils/sendNotification");
exports.createJobCard = async (req, res) => {
  try {
    const { complaintIds } = req.body;

    // ======================================
    // VALIDATION
    // ======================================

    if (!Array.isArray(complaintIds) || complaintIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one complaint",
      });
    }

    // ======================================
    // MAXIMUM 10 COMPLAINTS
    // ======================================

    if (complaintIds.length > 10) {
      return res.status(400).json({
        success: false,
        message: "Maximum 10 complaints are allowed in one Job Card",
      });
    }

    // ======================================
    // REMOVE DUPLICATE IDS
    // ======================================

    const uniqueComplaintIds = [
      ...new Set(complaintIds.map((id) => id.toString())),
    ];

    if (uniqueComplaintIds.length !== complaintIds.length) {
      return res.status(400).json({
        success: false,
        message: "Duplicate complaints are not allowed",
      });
    }

    // ======================================
    // FETCH COMPLAINTS
    // ======================================

    const complaints = await Complaint.find({
      _id: {
        $in: uniqueComplaintIds,
      },
    })
      .populate("assignedTo", "name phone department shift status")
      .populate("createdBy", "name email phone")
      .sort({
        createdAt: 1,
      });

    // ======================================
    // CHECK ALL COMPLAINTS FOUND
    // ======================================

    if (complaints.length !== uniqueComplaintIds.length) {
      return res.status(404).json({
        success: false,
        message: "One or more complaints were not found",
      });
    }

    // ======================================
    // ALL MUST BE ASSIGNED
    // ======================================

    const unassignedComplaint = complaints.find(
      (complaint) => !complaint.assignedTo,
    );

    if (unassignedComplaint) {
      return res.status(400).json({
        success: false,
        message: `Complaint ${unassignedComplaint.complaintId} has no assigned worker`,
      });
    }

    // ======================================
    // FIRST COMPLAINT
    // ======================================

    const firstComplaint = complaints[0];

    const firstWorkerId = firstComplaint.assignedTo._id.toString();

    const firstCategory = firstComplaint.category?.trim()?.toLowerCase();

    // ======================================
    // MAIN LOCATION
    // ======================================

    const getMainLocation = (complaint) => {
      if (complaint.hostel?.trim()) {
        return {
          type: "HOSTEL",

          value: complaint.hostel.trim().toLowerCase(),

          original: complaint.hostel.trim(),
        };
      }

      if (complaint.block?.trim()) {
        return {
          type: "BLOCK",

          value: complaint.block.trim().toLowerCase(),

          original: complaint.block.trim(),
        };
      }

      return null;
    };

    const firstLocation = getMainLocation(firstComplaint);

    if (!firstLocation) {
      return res.status(400).json({
        success: false,
        message: "Complaint location is missing",
      });
    }

    // ======================================
    // VALIDATE SAME WORKER
    // SAME CATEGORY
    // SAME LOCATION
    // ======================================

    for (const complaint of complaints) {
      const complaintWorkerId = complaint.assignedTo._id.toString();

      const complaintCategory = complaint.category?.trim()?.toLowerCase();

      const complaintLocation = getMainLocation(complaint);

      // SAME WORKER

      if (complaintWorkerId !== firstWorkerId) {
        return res.status(400).json({
          success: false,

          message: "All complaints must be assigned to the same worker",
        });
      }

      // SAME CATEGORY

      if (complaintCategory !== firstCategory) {
        return res.status(400).json({
          success: false,

          message: "All complaints must have the same category",
        });
      }

      // LOCATION REQUIRED

      if (!complaintLocation) {
        return res.status(400).json({
          success: false,

          message: `Location missing for complaint ${complaint.complaintId}`,
        });
      }

      // SAME LOCATION TYPE + VALUE

      if (
        complaintLocation.type !== firstLocation.type ||
        complaintLocation.value !== firstLocation.value
      ) {
        return res.status(400).json({
          success: false,

          message: "All complaints must belong to the same location",
        });
      }
    }

    // ======================================
    // CHECK IF COMPLAINT ALREADY EXISTS
    // IN ANOTHER JOB CARD
    // ======================================

    const existingJobCard = await JobCard.findOne({
      "complaints.complaint": {
        $in: uniqueComplaintIds,
      },
    });

    if (existingJobCard) {
      return res.status(400).json({
        success: false,

        message: "One or more selected complaints already belong to a Job Card",
      });
    }

    // ======================================
    // FETCH MATERIAL REQUESTS
    // ======================================

    const materialRequests = await MaterialRequest.find({
      complaint: {
        $in: uniqueComplaintIds,
      },
    });

    // ======================================
    // MATERIAL REQUEST MAP
    // ======================================

    const materialRequestMap = new Map();

    materialRequests.forEach((request) => {
      materialRequestMap.set(request.complaint.toString(), request);
    });

    // ======================================
    // CREATE COMPLAINT ITEMS
    // ======================================

    const complaintItems = complaints.map((complaint, index) => {
      const materialRequest = materialRequestMap.get(complaint._id.toString());

      const materialRequired = Boolean(materialRequest);

      const itemStatus =
        complaint.status === "IN_PROGRESS" ? "IN_PROGRESS" : "ASSIGNED";

      return {
        serialNumber: index + 1,

        complaint: complaint._id,

        roomNumber: complaint.roomNumber || "",

        floor: complaint.floor || "",

        title: complaint.title || "",

        titleHindi: complaint.titleHindi || "",

        description: complaint.description || "",

        descriptionHindi: complaint.descriptionHindi || "",

        priority: complaint.priority || "MEDIUM",

        status: itemStatus,

        startedAt: complaint.startedAt || null,

        // ======================================
        // STUDENT CONTACT SNAPSHOT
        // ======================================

        studentName: complaint.createdBy?.name || "",

        studentPhone: complaint.createdBy?.phone || "",

        // ======================================
        // MATERIAL
        // ======================================

        materialRequired,

        materialRequest: materialRequest?._id || null,
      };
    });
    // ======================================
    // HIGHEST PRIORITY
    // ======================================

    const priorityWeight = {
      LOW: 1,
      MEDIUM: 2,
      HIGH: 3,
      URGENT: 4,
    };

    const highestPriority = complaints.reduce((highest, complaint) => {
      const current = complaint.priority || "MEDIUM";

      return priorityWeight[current] > priorityWeight[highest]
        ? current
        : highest;
    }, "LOW");

    // JOB ID
    // ======================================

    const year = new Date().getFullYear();

    const jobCardId = `JOB-${year}-${Date.now().toString().slice(-8)}`;

    // ======================================
    // ASSIGNED DATE
    // USE EARLIEST ASSIGNMENT/START DATE
    // ======================================

    const assignedDates = complaints
      .map((complaint) => complaint.startedAt)
      .filter(Boolean)
      .map((date) => new Date(date));

    const assignedDate =
      assignedDates.length > 0
        ? new Date(Math.min(...assignedDates.map((date) => date.getTime())))
        : new Date();

    // ======================================
    // CREATE JOB CARD
    // ======================================

    const jobCard = await JobCard.create({
      jobCardId,

      hostel: firstLocation.type === "HOSTEL" ? firstLocation.original : "",

      block: firstLocation.type === "BLOCK" ? firstLocation.original : "",

      category: firstComplaint.category,

      assignedWorker: firstComplaint.assignedTo._id,

      assignedBy: req.user._id,

      assignedDate,

      complaints: complaintItems,

      totalComplaints: complaintItems.length,

      completedComplaints: 0,

      status: "IN_PROGRESS",

      workerStatus: "WORKING",

      priority: highestPriority,

      startedAt: assignedDate,

      isCompleted: false,

      movedToHistory: false,
    });

    // ======================================
    // POPULATE FINAL CARD
    // ======================================

    await jobCard.populate([
      {
        path: "complaints.complaint",

        populate: {
          path: "createdBy",

          select: "name email phone",
        },
      },

      {
        path: "complaints.materialRequest",

        select: `
          requestId
          materials
          reason
        `,
      },

      {
        path: "assignedWorker",

        select: "name phone department shift status",
      },

      {
        path: "assignedBy",

        select: "name role",
      },
    ]);

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(201).json({
      success: true,

      message: "Job Card created successfully",

      jobCard,
    });
  } catch (error) {
    console.log("CREATE JOB CARD ERROR:", error);

    console.log(error.stack);

    return res.status(500).json({
      success: false,

      message: error.message || "Failed to create Job Card",
    });
  }
};
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
  createdBy
`,
      })

      .populate({
        path: "complaints.materialRequest",

        select: `
    requestId
    materials
    reason
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
  createdBy
`,
      })

      // ======================================
      // MATERIAL REQUEST DETAILS
      // ======================================

      .populate({
        path: "complaints.materialRequest",

        select: `
    requestId
    materials
    reason
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
      })
      .populate({
        path: "assignedBy",
        select: "name role",
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

    const { complaintId, status } = req.body;

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
      complaintItem.status = "IN_PROGRESS";
      complaintItem.startedAt = new Date();

      jobCard.status = "IN_PROGRESS";
      jobCard.workerStatus = "WORKING";
    }

    // ======================================
    // WAITING MATERIAL
    // ======================================

    if (status === "WAITING_MATERIAL") {
      complaintItem.status = "WAITING_MATERIAL";
      complaintItem.materialRequired = true;

      jobCard.status = "WAITING_MATERIAL";
      jobCard.workerStatus = "WAITING_MATERIAL";
    }

    // ======================================
    // COMPLETED
    // ======================================

    if (status === "COMPLETED") {
      complaintItem.status = "COMPLETED";
      complaintItem.completedAt = new Date();

      const completedCount = jobCard.complaints.filter(
        (item) => item.status === "COMPLETED",
      ).length;

      jobCard.completedComplaints = completedCount;

      // ====================================
      // ALL COMPLAINTS COMPLETED
      // ====================================

      if (completedCount === jobCard.complaints.length) {
        jobCard.status = "COMPLETED";
        jobCard.workerStatus = "COMPLETED";

        jobCard.completedAt = new Date();

        jobCard.isCompleted = true;
      }

      // ====================================
      // SOME COMPLAINTS COMPLETED
      // ====================================
      else {
        jobCard.status = "PARTIALLY_COMPLETED";
        jobCard.workerStatus = "WORKING";

        jobCard.isCompleted = false;
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
        complaint.status = "COMPLETED";
        complaint.completedAt = new Date();
      } else if (status === "WAITING_MATERIAL") {
        complaint.status = "WAITING_MATERIAL";
      } else {
        complaint.status = "IN_PROGRESS";
      }

      await complaint.save();
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

exports.markJobCardPrinted = async (req, res) => {
  try {
    const jobCard = await JobCard.findById(req.params.id);

    if (!jobCard) {
      return res.status(404).json({
        success: false,
        message: "Job Card not found",
      });
    }

    jobCard.printStatus = "PRINTED";
    jobCard.printedAt = new Date();
    jobCard.printedBy = req.user._id;

    await jobCard.save();

    return res.status(200).json({
      success: true,
      message: "Job Card marked as printed",
      jobCard,
    });
  } catch (error) {
    console.log("MARK JOB CARD PRINTED ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to mark Job Card as printed",
    });
  }
};

// ==========================================
// VERIFY + COMPLETE SELECTED COMPLAINTS
// MAINTENANCE MANAGER VERIFICATION PAGE
// ==========================================
// ==========================================
// VERIFY + COMPLETE SELECTED COMPLAINTS
// MAINTENANCE MANAGER VERIFICATION PAGE
// ==========================================

exports.completeSelectedComplaints = async (req, res) => {
  try {
    const { id } = req.params;

    const { complaintIds } = req.body;

    // ======================================
    // VALIDATION
    // ======================================

    if (!Array.isArray(complaintIds) || complaintIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one complaint",
      });
    }

    // ======================================
    // REMOVE DUPLICATE IDS
    // ======================================

    const uniqueComplaintIds = [
      ...new Set(complaintIds.map((complaintId) => complaintId.toString())),
    ];

    // ======================================
    // FIND JOB CARD
    // ======================================

    const jobCard = await JobCard.findById(id);

    if (!jobCard) {
      return res.status(404).json({
        success: false,
        message: "Job Card not found",
      });
    }

    // ======================================
    // ONLY PRINTED JOB CARD CAN BE VERIFIED
    // ======================================

    if (jobCard.printStatus !== "PRINTED") {
      return res.status(400).json({
        success: false,
        message: "Only printed Job Cards can be verified",
      });
    }

    // ======================================
    // CHECK COMPLAINTS BELONG TO JOB CARD
    // ======================================

    const selectedItems = jobCard.complaints.filter((item) =>
      uniqueComplaintIds.includes(item.complaint.toString()),
    );

    if (selectedItems.length !== uniqueComplaintIds.length) {
      return res.status(400).json({
        success: false,
        message:
          "One or more selected complaints do not belong to this Job Card",
      });
    }

    // ======================================
    // ONLY NEWLY COMPLETED
    // ======================================

    const newlyCompletedIds = selectedItems
      .filter((item) => String(item.status).toUpperCase() !== "COMPLETED")
      .map((item) => item.complaint.toString());

    if (newlyCompletedIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Selected complaints are already completed",
      });
    }

    const now = new Date();

    // ======================================
    // FETCH COMPLAINTS BEFORE UPDATE
    //
    // STUDENT IDs + COMPLAINT DETAILS
    // NOTIFICATION KE LIYE
    // ======================================

    const complaintsToComplete = await Complaint.find({
      _id: {
        $in: newlyCompletedIds,
      },
    })
      .select(
        `
            complaintId
            title
            category
            priority
            createdBy
          `,
      )
      .populate("createdBy", "name");

    // ======================================
    // UPDATE COMPLAINTS INSIDE JOB CARD
    // ======================================

    jobCard.complaints.forEach((item) => {
      const complaintId = item.complaint.toString();

      if (newlyCompletedIds.includes(complaintId)) {
        item.status = "COMPLETED";

        item.completedAt = now;
      }
    });

    // ======================================
    // UPDATE ORIGINAL COMPLAINT COLLECTION
    // FINAL COMPLETION
    // ======================================

    await Complaint.updateMany(
      {
        _id: {
          $in: newlyCompletedIds,
        },
      },

      {
        $set: {
          status: "COMPLETED",

          completedAt: now,
        },
      },
    );

    // ======================================
    // CALCULATE COMPLETED COUNT
    // ======================================

    const completedCount = jobCard.complaints.filter(
      (item) => item.status === "COMPLETED",
    ).length;

    jobCard.completedComplaints = completedCount;

    // ======================================
    // ALL COMPLAINTS COMPLETED
    // ======================================

    if (completedCount === jobCard.complaints.length) {
      jobCard.status = "COMPLETED";

      jobCard.workerStatus = "COMPLETED";

      jobCard.isCompleted = true;

      jobCard.completedAt = now;
    }

    // ======================================
    // PARTIALLY COMPLETED
    // ======================================
    else {
      jobCard.status = "PARTIALLY_COMPLETED";

      jobCard.workerStatus = "WORKING";

      jobCard.isCompleted = false;
    }

    // ======================================
    // UPDATE WORKER CURRENT JOB COUNT
    // ======================================

    if (jobCard.assignedWorker) {
      const worker = await User.findById(jobCard.assignedWorker);

      if (worker) {
        worker.currentJobs = Math.max(
          0,

          (worker.currentJobs || 0) - newlyCompletedIds.length,
        );

        worker.status = worker.currentJobs >= 10 ? "BUSY" : "ACTIVE";

        await worker.save();
      }
    }

    // ======================================
    // SAVE JOB CARD
    // ======================================

    await jobCard.save();

    // ======================================
    // FINAL COMPLETION NOTIFICATION
    // STUDENT KO
    //
    // IMPORTANT:
    // SIRF MAINTENANCE MANAGER FINAL
    // VERIFICATION KE BAAD YE JAYEGA
    // ======================================

    await Promise.allSettled(
      complaintsToComplete.map(async (complaint) => {
        const studentId = complaint.createdBy?._id;

        if (!studentId) {
          return;
        }

        let notificationPriority = "MEDIUM";

        if (complaint.priority === "URGENT") {
          notificationPriority = "CRITICAL";
        } else if (complaint.priority === "HIGH") {
          notificationPriority = "HIGH";
        } else if (complaint.priority === "LOW") {
          notificationPriority = "LOW";
        }

        try {
          await sendNotification({
            receiver: studentId,

            sender: req.user._id,

            title: "Complaint Completed",

            message: `Your complaint ${complaint.complaintId} (${complaint.title || complaint.category || "Maintenance Complaint"}) has been verified and completed successfully.`,

            type: "STATUS_UPDATE",

            priority: notificationPriority,

            relatedComplaint: complaint._id,

            relatedId: complaint._id,

            relatedModel: "Complaint",

            actionUrl: "/dashboard",
          });
        } catch (notificationError) {
          console.log(
            "COMPLETION NOTIFICATION ERROR:",
            notificationError.message,
          );
        }
      }),
    );

    // ======================================
    // POPULATE RESPONSE
    // ======================================

    await jobCard.populate([
      {
        path: "complaints.complaint",

        populate: {
          path: "createdBy",

          select: "name email phone",
        },
      },

      {
        path: "complaints.materialRequest",

        select: `
          requestId
          materials
          reason
        `,
      },

      {
        path: "assignedWorker",

        select: "name phone department shift status currentJobs",
      },

      {
        path: "assignedBy",

        select: "name role",
      },
    ]);

    // ======================================
    // SUCCESS RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      message: `${newlyCompletedIds.length} complaint${
        newlyCompletedIds.length !== 1 ? "s" : ""
      } marked completed`,

      completedCount: newlyCompletedIds.length,

      jobCard,
    });
  } catch (error) {
    console.log("COMPLETE SELECTED COMPLAINTS ERROR:", error);

    return res.status(500).json({
      success: false,

      message: error.message || "Failed to complete selected complaints",
    });
  }
};
