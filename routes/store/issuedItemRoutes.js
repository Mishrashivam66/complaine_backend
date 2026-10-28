const express = require("express");
const router = express.Router();

const { protect } = require("../../middleware/authMiddleware");
const roleMiddleware = require("../../middleware/roleMiddleware");

const {
  issueItem,
  getIssuedItems,
  updateIssuedStatus,
} = require("../../controllers/store/issuedItemController");

router.use(protect);

// Issue material and deduct stock
router.post("/issue", roleMiddleware("STORE_MANAGER"), issueItem);

// View issue history
router.get(
  "/all",
  roleMiddleware("STORE_MANAGER", "MAINTENANCE_MANAGER"),
  getIssuedItems,
);

// Confirm delivery
router.put("/deliver/:id", roleMiddleware("STORE_MANAGER"), updateIssuedStatus);

module.exports = router;
