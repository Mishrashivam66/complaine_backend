const express = require("express");
const router = express.Router();

const { protect, authorizeRoles } = require("../../middleware/authMiddleware");

const {
  getBlockComplaints,
} = require("../../controllers/blockAdmin/blockAdminController");

router.use(protect);
router.use(authorizeRoles("BLOCK_ADMIN"));

router.get("/complaints", getBlockComplaints);

module.exports = router;
