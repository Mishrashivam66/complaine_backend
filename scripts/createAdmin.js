require("dotenv").config();

const mongoose = require("mongoose");

const User = require("../models/User");

// ==========================================
// CREATE ADMIN
// ==========================================

const createAdmin = async () => {
  try {
    // ======================================
    // CONNECT DATABASE
    // ======================================

    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB Connected");

    // ======================================
    // CHECK EXISTING ADMIN
    // ======================================

    const existingAdmin = await User.findOne({
      role: "ADMIN",
      email: "admin@amity.edu",
    });

    if (existingAdmin) {
      console.log("Admin already exists");

      await mongoose.connection.close();

      process.exit(0);
    }

    // ======================================
    // CREATE ADMIN
    // ======================================

    const admin = await User.create({
      name: "System Admin",

      email: "admin@amity.edu",

      password: "Admin@123",

      role: "ADMIN",

      designation: "System Administrator",

      employeeId: "ADM001",

      isActive: true,

      isApproved: true,

      isVerified: true,
    });

    // ======================================
    // SUCCESS
    // ======================================

    console.log("Admin created:", admin.email);

    await mongoose.connection.close();

    process.exit(0);
  } catch (error) {
    console.log("CREATE ADMIN ERROR:", error);

    await mongoose.connection.close();

    process.exit(1);
  }
};

createAdmin();

// node scripts/createAdmin.js
