const express = require("express");
const router = express.Router();

const { protect } = require("../../middleware/authMiddleware");
const roleMiddleware = require("../../middleware/roleMiddleware");

const {
  addDamagedItem,
  getDamagedItems,
  updateDamagedStatus,
  deleteDamagedItem,
} = require("../../controllers/store/damagedItemController");

router.use(protect);
router.use(roleMiddleware("STORE_MANAGER"));

// Existing legacy endpoints retained
router.post("/add", addDamagedItem);
router.get("/all", getDamagedItems);
router.put("/update-status/:id", updateDamagedStatus);
router.delete("/:id", deleteDamagedItem);

module.exports = router;
