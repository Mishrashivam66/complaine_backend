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

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      !password ||
      typeof role !== "string" ||
      !role.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Name, email, password and role are required",
      });
    }

    // ==========================================
    // NORMALIZE INPUT
    // ==========================================

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedRole = role.trim().toUpperCase();

    // ==========================================
    // RESTRICT SPECIAL ROLES
    // ==========================================

    if (normalizedRole === "WARDEN") {
      return res.status(403).json({
        success: false,
        message: "Warden accounts can only be created by the Hostel Director",
      });
    }

    if (
      normalizedRole === "ADMIN" ||
      normalizedRole === "SUPER_ADMIN" ||
      normalizedRole === "HOSTEL_DIRECTOR"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Admin and Hostel Director accounts cannot be created from this panel",
      });
    }

    // ==========================================
    // ALLOWED ADMIN-CREATED ROLES
    // ==========================================

    const allowedRoles = [
      "MAINTENANCE_MANAGER",
      "STORE_MANAGER",
      "MESS_MANAGER",
      "BLOCK_ADMIN",
    ];

    if (!allowedRoles.includes(normalizedRole)) {
      return res.status(403).json({
        success: false,
        message: "This role cannot be created from the Admin panel",
      });
    }

    // ==========================================
    // BLOCK ADMIN VALIDATION
    // ==========================================

    let normalizedBlock = "";

    if (normalizedRole === "BLOCK_ADMIN") {
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
    // PASSWORD VALIDATION
    // ==========================================

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    // ==========================================
    // CHECK EXISTING USER
    // ==========================================

    const userExists = await User.findOne({
      email: normalizedEmail,
    });

    if (userExists) {
      return res.status(409).json({
        success: false,
        message: "User already exists",
      });
    }

    // ==========================================
    // CREATE VERIFIED USER
    // ==========================================

    const userData = {
      name: normalizedName,
      email: normalizedEmail,
      password,
      role: normalizedRole,

      // Admin-created accounts do not require
      // email OTP verification.
      isVerified: true,

      // Account can log in immediately.
      isActive: true,

      // No pending verification tokens.
      verificationToken: null,
      verificationTokenExpire: null,
      emailOTP: null,
      emailOTPExpire: null,
    };

    // ==========================================
    // ASSIGN BLOCK TO BLOCK ADMIN
    // ==========================================

    if (normalizedRole === "BLOCK_ADMIN") {
      userData.assignedBlock = normalizedBlock;
    }

    // Password is hashed automatically by
    // the pre("save") hook in User.js.
    const user = await User.create(userData);

    // ==========================================
    // SAFE RESPONSE
    // ==========================================

    const safeUser = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      assignedBlock: user.assignedBlock,
      isVerified: user.isVerified,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };

    return res.status(201).json({
      success: true,
      message: `${normalizedRole} created successfully`,
      user: safeUser,
    });
  } catch (error) {
    console.error("ADMIN CREATE USER ERROR:", error);

    // ==========================================
    // DUPLICATE USER
    // ==========================================

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "User already exists",
      });
    }

    // ==========================================
    // MONGOOSE VALIDATION ERROR
    // ==========================================

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    // ==========================================
    // SERVER ERROR
    // ==========================================

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
