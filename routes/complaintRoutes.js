const express = require("express");

const {
  createComplaint,
  getAllComplaints,
  getComplaintById,
} = require("../controllers/complaintController");

const router = express.Router();

router.post("/", createComplaint);

router.get("/", getAllComplaints);

router.get("/:id", getComplaintById);

module.exports = router;