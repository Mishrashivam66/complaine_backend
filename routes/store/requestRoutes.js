const express = require("express");

const router = express.Router();

const {
  createRequest,
  getRequests,
  updateMaterialStatus,
} = require("../../controllers/store/requestController");

// CREATE REQUEST

router.post("/add", createRequest);

// GET ALL REQUESTS

router.get("/all", getRequests);

// UPDATE STATUS

router.put("/update-material/:requestId/:materialId", updateMaterialStatus);

module.exports = router;
