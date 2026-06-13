const User = require("./models/User");

const connectDB = require("./config/db");

require("dotenv").config();

// CONNECT DB

connectDB();

// UPDATE

const updateStudents = async () => {
  try {
    await User.updateMany(
      {
        role: "STUDENT",

        isApproved: true,
      },

      {
        $set: {
          isHosteller: true,
        },
      },
    );

    console.log("Students Updated Successfully");

    process.exit();
  } catch (error) {
    console.log(error);

    process.exit();
  }
};

updateStudents();
