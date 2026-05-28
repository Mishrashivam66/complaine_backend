const Notification =
require("../models/Notification");

const sendNotification =
require("../utils/sendNotification");


// Test Notification
const testNotification =
async (req, res) => {

  try {

    const notification =
    await sendNotification({

      user:
      "6a17cd9175dc49fecd7b8492",

      title:
      "Test Notification",

      message:
      "Socket.IO Working",

      type:
      "SYSTEM"

    });

    res.json({

      success: true,
      notification

    });

  } catch (error) {

    res.status(500).json({
      message: error.message
    });

  }

};


// Get User Notifications
const getNotifications =
async (req, res) => {

  try {

    const notifications =
    await Notification.find({

      user: req.params.userId

    }).sort({

      createdAt: -1

    });

    res.status(200).json({

      success: true,
      notifications

    });

  } catch (error) {

    res.status(500).json({
      message: error.message
    });

  }

};


module.exports = {
  testNotification,
  getNotifications
};