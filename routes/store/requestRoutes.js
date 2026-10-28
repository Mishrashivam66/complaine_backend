const express = require("express");
const router = express.Router();

const { protect } = require("../../middleware/authMiddleware");
const roleMiddleware = require("../../middleware/roleMiddleware");

const {
  createRequest,
  getRequests,
  updateMaterialStatus,
} = require("../../controllers/store/requestController");

router.use(protect);

// Legacy general requests
router.post("/add", roleMiddleware("MAINTENANCE_MANAGER"), createRequest);

// Manager and Technician complaint-wise requests
router.get(
  "/all",
  roleMiddleware("MAINTENANCE_MANAGER", "STORE_MANAGER"),
  getRequests,
);

// Item-wise Store approval
router.put(
  "/update-material/:requestId/:materialId",
  roleMiddleware("STORE_MANAGER"),
  updateMaterialStatus,
);

module.exports = router;
