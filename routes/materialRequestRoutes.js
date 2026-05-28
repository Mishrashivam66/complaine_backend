const express = require("express");

const {
  createMaterialRequest,
  getAllMaterialRequests,
  approveMaterialRequest,
} = require("../controllers/materialRequestController");

const router = express.Router();

router.post("/", createMaterialRequest);

router.get("/", getAllMaterialRequests);

router.put(
  "/approve/:id",
  approveMaterialRequest
);

module.exports = router;