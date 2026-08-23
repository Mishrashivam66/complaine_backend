const User = require("../../models/User");

// ==========================================
// CREATE USER - ADMIN
// ==========================================

exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // ==========================================
    // REQUIRED FIELDS
    // ==========================================

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "Name, email, password and role are required",
      });
    }

    // ==========================================
    // RESTRICT SPECIAL ROLES
    // ==========================================

    if (role === "WARDEN") {
      return res.status(403).json({
        success: false,
        message: "Warden accounts can only be created by the Hostel Director",
      });
    }

    if (role === "ADMIN" || role === "HOSTEL_DIRECTOR") {
      return res.status(403).json({
        success: false,
        message:
          "Admin and Hostel Director accounts cannot be created from this panel",
      });
    }

    // ==========================================
    // NORMALIZE EMAIL
    // ==========================================

    const normalizedEmail = email.trim().toLowerCase();

    // ==========================================
    // CHECK EXISTING USER
    // ==========================================

    const userExists = await User.findOne({
      email: normalizedEmail,
    });

    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    // ==========================================
    // CREATE USER
    // ==========================================

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role,
    });

    // ==========================================
    // RESPONSE
    // ==========================================

    return res.status(201).json({
      success: true,
      message: `${role} created successfully`,
      user,
    });
  } catch (error) {
    console.log("ADMIN CREATE USER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Server Error",
    });
  }
};
