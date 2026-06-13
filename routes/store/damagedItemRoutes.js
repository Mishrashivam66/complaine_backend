const express = require("express");

const router = express.Router();

const {
  addDamagedItem,

  getDamagedItems,

  updateDamagedStatus,

  deleteDamagedItem,
} = require("../../controllers/store/damagedItemController");

// ==========================================
// ADD
// ==========================================

router.post("/add", addDamagedItem);

// ==========================================
// GET ALL
// ==========================================

router.get("/all", getDamagedItems);

// ==========================================
// UPDATE STATUS
// ==========================================

router.put("/update/:id", updateDamagedStatus);

// ==========================================
// DELETE
// ==========================================

router.delete("/delete/:id", deleteDamagedItem);

module.exports = router;
