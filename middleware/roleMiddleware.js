"use strict";

// ==========================================
// AMI MAINTENANCE - ROLE AUTHORIZATION
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
      // ======================================
      // CHECK AUTHENTICATION
      // ======================================

      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      // ======================================
      // ACCOUNT STATUS CHECK
      // ======================================

      if (req.user.isActive === false || req.user.isDeleted === true) {
        return res.status(403).json({
          success: false,
          message: "Account disabled or archived",
        });
      }

      // ======================================
      // NORMALIZE LOGGED-IN ROLE
      // ======================================

      const userRole = String(req.user.role || "")
        .trim()
        .toUpperCase();

      // ======================================
      // DEBUG: ROLE ACCESS CHECK
      // ======================================

      console.log("========== ROLE ACCESS CHECK ==========");
      console.log("Method:", req.method);
      console.log("Path:", req.originalUrl);
      console.log("Logged-in Role:", userRole);
      console.log("Allowed Roles:", allowedRoles);
      console.log("=======================================");

      // ======================================
      // VERIFY PERMISSIONS
      // ======================================

      if (!userRole || !allowedRoles.includes(userRole)) {
        console.warn("ROLE ACCESS DENIED:", {
          method: req.method,
          path: req.originalUrl,
          loggedInRole: userRole,
          allowedRoles,
        });

        return res.status(403).json({
          success: false,
          message:
            "Access denied. You do not have permission to access this resource.",
        });
      }

      // ======================================
      // AUTHORIZED
      // ======================================

      console.log("ROLE ACCESS GRANTED:", {
        method: req.method,
        path: req.originalUrl,
        role: userRole,
      });

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
