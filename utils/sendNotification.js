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
  type = "GENERAL",
  relatedComplaint = null,
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
    // SAVE NOTIFICATION
    // ==========================================

    const notification = await Notification.create({
      receiver,

      sender,

      title,

      message,

      type,

      relatedComplaint,

      isRead: false,
    });

    // ==========================================
    // POPULATE SENDER
    // ==========================================

    await notification.populate(
      "sender",

      "name role profilePhoto",
    );

    // ==========================================
    // SOCKET EMIT
    // ==========================================

    try {
      const io = getIO();

      io.to(receiver.toString()).emit(
        "newNotification",

        notification,
      );

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
