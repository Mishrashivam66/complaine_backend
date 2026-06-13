const User = require("../../models/User");

const Category = require("../../models/Category");

// ==========================================
// CREATE USER
// ==========================================

exports.createUser = async (req, res) => {
  try {
    const {
      name,

      email,

      password,

      role,

      hostel,
    } = req.body;

    // ==========================================
    // CHECK EXISTING USER
    // ==========================================

    const userExists = await User.findOne({
      email,
    });

    if (userExists) {
      return res.status(400).json({
        success: false,

        message: "User already exists",
      });
    }

    // ==========================================
    // HOSTEL CODE CONVERSION
    // ==========================================

    let hostelCode = hostel;

    if (hostel === "Boys Hostel H1") {
      hostelCode = "H1";
    }

    if (hostel === "Boys Hostel H4") {
      hostelCode = "H4";
    }

    if (hostel === "Girls Hostel H2") {
      hostelCode = "H2";
    }

    if (hostel === "Girls Hostel H3") {
      hostelCode = "H3";
    }

    if (hostel === "Faculty Hostel H5") {
      hostelCode = "H5";
    }

    // ==========================================
    // CREATE USER OBJECT
    // ==========================================

    const userData = {
      name,

      email,

      password,

      role,
    };

    // ==========================================
    // WARDEN EXTRA DATA
    // ==========================================

    if (role === "WARDEN") {
      userData.assignedHostel = hostelCode;

      userData.designation = "Hostel Warden";

      userData.isApproved = true;
    }

    // ==========================================
    // CREATE USER
    // ==========================================

    const user = await User.create(userData);

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(201).json({
      success: true,

      message: `${role} created successfully`,

      user,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message || "Server Error",
    });
  }
};
