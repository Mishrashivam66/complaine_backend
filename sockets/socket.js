const { Server } = require("socket.io");

let io;

// ==========================================
// INITIALIZE SOCKET
// ==========================================

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",

      methods: ["GET", "POST", "PUT", "DELETE"],
    },
  });

  // ==========================================
  // SOCKET CONNECTION
  // ==========================================

  io.on("connection", (socket) => {
    console.log("User Connected:", socket.id);

    // ==========================================
    // JOIN USER ROOM
    // ==========================================

    socket.on(
      "join_room",

      (userId) => {
        socket.join(userId);

        console.log("User Joined Room:", userId);
      },
    );

    // ==========================================
    // MARK NOTIFICATION READ
    // ==========================================

    socket.on(
      "notification_read",

      (notificationId) => {
        console.log("Notification Read:", notificationId);
      },
    );

    // ==========================================
    // DELETE NOTIFICATION
    // ==========================================

    socket.on(
      "notification_deleted",

      (notificationId) => {
        console.log("Notification Deleted:", notificationId);
      },
    );

    // ==========================================
    // DISCONNECT
    // ==========================================

    socket.on(
      "disconnect",

      () => {
        console.log("User Disconnected:", socket.id);
      },
    );
  });

  console.log("Socket.IO Initialized");

  return io;
};

// ==========================================
// GET IO INSTANCE
// ==========================================

const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }

  return io;
};

module.exports = {
  initSocket,

  getIO,
};
