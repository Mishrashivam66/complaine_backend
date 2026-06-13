const express = require("express");

const router = express.Router();

const {
  issueItem,

  getIssuedItems,

  updateIssuedStatus,
} = require("../../controllers/store/issuedItemController");

// ==========================================
// ISSUE ITEM
// ==========================================

router.post("/issue", issueItem);

// ==========================================
// GET ISSUED ITEMS
// ==========================================

router.get("/all", getIssuedItems);

// ==========================================
// DELIVER ITEM
// ==========================================

router.put("/deliver/:id", updateIssuedStatus);

module.exports = router;
