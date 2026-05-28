const Notification =
require("../models/Notification");

const { getIO } =
require("../sockets/socket");

const sendNotification =
async ({
user,
title,
message,
type
}) => {

const notification =
await Notification.create({

user,
title,
message,
type

});

try {

const io = getIO();

io.emit(
"new_notification",
notification
);

} catch(error) {

console.log(
"Socket not initialized"
);

}

return notification;

};

module.exports =
sendNotification;