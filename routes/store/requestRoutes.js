const express = require("express");

const router = express.Router();

const {
  createRequest,

  getRequests,

  updateRequestStatus,
} = require("../../controllers/store/requestController");

// CREATE REQUEST

router.post("/add", createRequest);

// GET ALL REQUESTS

router.get("/all", getRequests);

// UPDATE STATUS

router.put("/update/:id", updateRequestStatus);

module.exports = router;
