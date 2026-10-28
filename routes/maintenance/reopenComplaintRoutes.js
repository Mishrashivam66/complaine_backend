const express = require("express");
const router = express.Router();

const {
  getAllReopenComplaints,
  createReopenComplaint,
  reassignWorker,
} = require("../../controllers/maintenance/reopenComplaintController");

const { protect } = require("../../middleware/authMiddleware");
const roleMiddleware = require("../../middleware/roleMiddleware");

router.get(
  "/",
  protect,
  roleMiddleware("MAINTENANCE_MANAGER"),
  getAllReopenComplaints,
);

router.post(
  "/create",
  protect,
  roleMiddleware("STUDENT"),
  createReopenComplaint,
);

router.put(
  "/reassign/:id",
  protect,
  roleMiddleware("MAINTENANCE_MANAGER"),
  reassignWorker,
);

module.exports = router;
