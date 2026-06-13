const jwt = require("jsonwebtoken");

const User = require("../models/User");

// ==========================================
// PROTECT ROUTES
// ==========================================

const protect = async (req, res, next) => {
  try {
    let token;

    // ======================================
    // CHECK TOKEN
    // ======================================

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    // ======================================
    // NO TOKEN
    // ======================================

    if (!token) {
      return res.status(401).json({
        success: false,

        message: "Not Authorized",
      });
    }

    // ======================================
    // VERIFY TOKEN
    // ======================================

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ======================================
    // FIND USER
    // ======================================

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,

        message: "User not found",
      });
    }

    // ======================================
    // SAVE USER
    // ======================================

    req.user = user;

    next();
  } catch (error) {
    console.log(error);

    return res.status(401).json({
      success: false,

      message: "Invalid Token",
    });
  }
};

// ==========================================
// AUTHORIZE ROLES
// ==========================================

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    const userRole = req.user.role?.toString().trim().toLowerCase();

    const allowedRoles = roles.map((role) =>
      role.toString().trim().toLowerCase(),
    );

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,

        message: "Access Denied",
      });
    }

    next();
  };
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  protect,

  authorizeRoles,
};
