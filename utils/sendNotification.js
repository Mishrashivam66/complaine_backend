const Notification = require("../models/Notification");

// ==========================================
// SEND NOTIFICATION
// DATABASE ONLY - NO SOCKET.IO
// ==========================================

const sendNotification = async ({
  receiver,
  sender = null,
  title,
  message,
  type = "SYSTEM",
  priority = "LOW",
  relatedComplaint = null,
  relatedId = null,
  relatedModel = null,
  actionUrl = "/dashboard",
  isPermanent = false,
}) => {
  try {
    // ==========================================
    // VALIDATION
    // ==========================================

    if (!receiver) {
      console.log("Notification receiver missing");
      return null;
    }

    // ==========================================
    // CREATE NOTIFICATION
    // ==========================================

    const notification = await Notification.create({
      receiver,
      sender,
      title,
      message,
      type,
      priority,
      relatedComplaint,
      relatedId,
      relatedModel,
      actionUrl,
      isPermanent,
      isRead: false,
    });

    // ==========================================
    // POPULATE SENDER
    // ==========================================

    if (sender) {
      await notification.populate("sender", "name role profilePhoto");
    }

    console.log("Notification Saved Successfully");

    return notification;
  } catch (error) {
    console.log("Notification Error:", error.message);
    return null;
  }
};

module.exports = sendNotification;
