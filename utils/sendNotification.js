const Notification = require("../models/Notification");

const { getIO } = require("../sockets/socket");

// ==========================================
// SEND NOTIFICATION
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

      return;
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

    await notification.populate("sender", "name role profilePhoto");

    // ==========================================
    // SOCKET EMIT
    // ==========================================

    try {
      const io = getIO();

      // REAL TIME NOTIFICATION

      io.to(receiver.toString()).emit("new_notification", notification);

      // UPDATE BELL COUNT

      io.to(receiver.toString()).emit("notification_count_updated");

      console.log("Notification Sent Successfully");
    } catch (socketError) {
      console.log("Socket Error:", socketError.message);
    }

    return notification;
  } catch (error) {
    console.log("Notification Error:", error.message);
  }
};

module.exports = sendNotification;
