const express = require("express");

const {
  createJobCard,
  getAllJobCards,
  getJobCardById,
  assignWorker,
  updateWorkerStatus,
} = require("../controllers/jobCardController");

const router = express.Router();

router.post("/", createJobCard);

router.get("/", getAllJobCards);

router.get("/:id", getJobCardById);

router.put(
  "/assign-worker/:id",
  assignWorker
);

router.put(
  "/update-status/:id",
  updateWorkerStatus
);

module.exports = router;