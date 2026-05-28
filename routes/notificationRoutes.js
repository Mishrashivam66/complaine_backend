const express =
require("express");

const {
  testNotification,
  getNotifications
} =
require("../controllers/notificationController");

const router =
express.Router();

router.get(
  "/test",
  testNotification
);

router.get(
  "/:userId",
  getNotifications
);

module.exports =
router;