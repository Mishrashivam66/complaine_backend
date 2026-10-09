const User = require("../../models/User");

// ==========================================
// CREATE USER - ADMIN
// ==========================================

exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role, assignedBlock } = req.body;

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
    // BLOCK ADMIN VALIDATION
    // ==========================================

    let normalizedBlock = "";

    if (role === "BLOCK_ADMIN") {
      if (typeof assignedBlock !== "string" || !assignedBlock.trim()) {
        return res.status(400).json({
          success: false,
          message: "Please assign a block to the Block Admin",
        });
      }

      normalizedBlock = assignedBlock.trim().toUpperCase();

      const validBlocks = ["A", "B", "C", "D", "E", "F"];

      if (!validBlocks.includes(normalizedBlock)) {
        return res.status(400).json({
          success: false,
          message: "Invalid block selected",
        });
      }
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

    const userData = {
      name: name.trim(),
      email: normalizedEmail,
      password,
      role,
    };

    if (role === "BLOCK_ADMIN") {
      userData.assignedBlock = normalizedBlock;
    }

    const user = await User.create(userData);

    // ==========================================
    // SAFE RESPONSE
    // ==========================================

    const safeUser = user.toObject();

    delete safeUser.password;
    delete safeUser.emailOTP;
    delete safeUser.verificationToken;
    delete safeUser.resetPasswordToken;

    return res.status(201).json({
      success: true,
      message: `${role} created successfully`,
      user: safeUser,
    });
  } catch (error) {
    console.error("ADMIN CREATE USER ERROR:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "User already exists",
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
