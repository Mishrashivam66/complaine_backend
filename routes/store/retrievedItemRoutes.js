const express = require("express");
const router = express.Router();

const {
  getAll,
  receive,
} = require("../../controllers/store/retrievedItemController");

router.get("/all", getAll);
router.post("/receive", receive);

module.exports = router;
