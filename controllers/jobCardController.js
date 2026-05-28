const JobCard = require("../models/JobCard");


// Create Job Card
const createJobCard = async (req, res) => {
  try {

    const jobCard = await JobCard.create({
      jobCardId:
        "JOB-" +
        Date.now().toString().slice(-6),

      ...req.body,
    });

    res.status(201).json({
      success: true,
      jobCard,
    });

  } catch (error) {

    res.status(500).json({
      message: error.message,
    });

  }
};


// Get All Job Cards
const getAllJobCards = async (req, res) => {
  try {

    const jobCards = await JobCard.find()
      .populate("complaint")
      .populate("assignedWorker")
      .populate("assignedBy")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      jobCards,
    });

  } catch (error) {

    res.status(500).json({
      message: error.message,
    });

  }
};


// Get Single Job Card
const getJobCardById = async (req, res) => {
  try {

    const jobCard = await JobCard.findById(
      req.params.id
    )
      .populate("complaint")
      .populate("assignedWorker")
      .populate("assignedBy");

    if (!jobCard) {
      return res.status(404).json({
        message: "Job Card not found",
      });
    }

    res.status(200).json({
      success: true,
      jobCard,
    });

  } catch (error) {

    res.status(500).json({
      message: error.message,
    });

  }
};


// Assign Worker
const assignWorker = async (req, res) => {
  try {

    const { workerId } = req.body;

    const jobCard =
      await JobCard.findByIdAndUpdate(
        req.params.id,
        {
          assignedWorker: workerId,
        },
        {
          new: true,
        }
      );

    res.status(200).json({
      success: true,
      jobCard,
    });

  } catch (error) {

    res.status(500).json({
      message: error.message,
    });

  }
};


// Update Worker Status
const updateWorkerStatus = async (req, res) => {
  try {

    const {
      workerStatus,
      status,
      remarks,
      materialRequired,
    } = req.body;

    const jobCard =
      await JobCard.findByIdAndUpdate(
        req.params.id,
        {
          workerStatus,
          status,
          remarks,
          materialRequired,

          ...(status === "COMPLETED" && {
            completionTime: new Date(),
          }),
        },
        {
          new: true,
        }
      );

    res.status(200).json({
      success: true,
      jobCard,
    });

  } catch (error) {

    res.status(500).json({
      message: error.message,
    });

  }
};


module.exports = {
  createJobCard,
  getAllJobCards,
  getJobCardById,
  assignWorker,
  updateWorkerStatus,
};