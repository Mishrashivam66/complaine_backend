"use strict";

const jwt = require("jsonwebtoken");
const User = require("../models/User");

// ==========================================
// PROTECT ROUTES
// ==========================================

const protect = async (req, res, next) => {
  try {
    let token;

    const authorization = req.headers.authorization;

    if (authorization && authorization.startsWith("Bearer ")) {
      token = authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select(
      "-password -emailOTP -verificationToken -resetPasswordToken",
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.isActive === false || user.isDeleted === true) {
      return res.status(403).json({
        success: false,
        message: "Account disabled",
      });
    }

    // ======================================
    // DEBUG: LOGGED-IN USER ROLE
    // ======================================

    if (
      req.method === "POST" &&
      req.originalUrl.includes("/store/issued-items/issue")
    ) {
      console.log("========== ISSUE AUTH CHECK ==========");
      console.log("Method:", req.method);
      console.log("Path:", req.originalUrl);
      console.log("Authenticated User ID:", String(user._id));
      console.log("Database Role:", user.role);
      console.log(
        "Normalized Role:",
        String(user.role || "")
          .trim()
          .toUpperCase(),
      );
      console.log("======================================");
    }

    req.user = user;

    return next();
  } catch (error) {
    console.error("AUTH MIDDLEWARE:", error.name);

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
  const allowedRoles = roles
    .flat()
    .map((role) =>
      String(role || "")
        .trim()
        .toUpperCase(),
    )
    .filter(Boolean);

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const userRole = String(req.user.role || "")
      .trim()
      .toUpperCase();

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: "Access Denied",
      });
    }

    return next();
  };
};

module.exports = {
  protect,
  authorizeRoles,
};
