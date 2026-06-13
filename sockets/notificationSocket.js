const notificationSocket = (io) => {
  io.on("connection", (socket) => {
    console.log("Notification Socket Connected");

    socket.on("join_room", (userId) => {
      socket.join(userId);

      console.log(`User Joined Notification Room: ${userId}`);
    });

    socket.on("disconnect", () => {
      console.log("Notification Socket Disconnected");
    });
  });
};

module.exports = notificationSocket;
