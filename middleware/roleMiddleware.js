"use strict";

// ==========================================
// AMIMAINTAIN - ROLE AUTHORIZATION
// ==========================================

const roleMiddleware = (...roles) => {
  const allowedRoles = roles
    .flat()
    .map((role) =>
      String(role || "")
        .trim()
        .toUpperCase(),
    )
    .filter(Boolean);

  return (req, res, next) => {
    try {
      // ====================================
      // CHECK AUTHENTICATION
      // ====================================

      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      // ====================================
      // ACCOUNT STATUS CHECK
      // ====================================

      if (req.user.isActive === false || req.user.isDeleted === true) {
        return res.status(403).json({
          success: false,
          message: "Account disabled or archived",
        });
      }

      // ====================================
      // NORMALIZE LOGGED-IN ROLE
      // ====================================

      const userRole = String(req.user.role || "")
        .trim()
        .toUpperCase();

      // ====================================
      // VERIFY PERMISSIONS
      // ====================================

      if (!userRole || !allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You do not have permission to access this resource.",
        });
      }

      // ====================================
      // AUTHORIZED
      // ====================================

      return next();
    } catch (error) {
      console.error("ROLE MIDDLEWARE ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Authorization failed",
      });
    }
  };
};

module.exports = roleMiddleware;
