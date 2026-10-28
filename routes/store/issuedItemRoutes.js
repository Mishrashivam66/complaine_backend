const express = require("express");
const router = express.Router();

const {
  issueItem,
  getIssuedItems,
  markDelivered,
} = require("../../controllers/store/issuedItemController");

// These endpoints should be mounted behind the
// existing protect + STORE_MANAGER middleware
// in storeRoutes.js.

router.post("/issue", issueItem);
router.get("/all", getIssuedItems);
router.put("/deliver/:id", markDelivered);

module.exports = router;
