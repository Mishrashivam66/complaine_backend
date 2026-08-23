require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../models/User");

const createHostelDirector = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const existingDirector = await User.findOne({
      role: "HOSTEL_DIRECTOR",
    });

    if (existingDirector) {
      console.log("Hostel Director already exists");
      process.exit(0);
    }

    const director = await User.create({
      name: "Hostel Director",
      email: "hosteldirector@amity.edu",
      password: "Director@123",
      role: "HOSTEL_DIRECTOR",
      designation: "Hostel Director",
      employeeId: "HD001",
      isActive: true,
      isApproved: true,
      isVerified: true,
    });

    console.log("Hostel Director created:", director.email);

    process.exit(0);
  } catch (error) {
    console.log("CREATE HOSTEL DIRECTOR ERROR:", error);
    process.exit(1);
  }
};

createHostelDirector();
