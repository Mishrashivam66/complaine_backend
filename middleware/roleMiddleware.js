const roleMiddleware = (...roles) => {
  return (req, res, next) => {
    try {
      // ======================================
      // CHECK USER
      // ======================================

      if (!req.user) {
        return res.status(401).json({
          success: false,

          message: "User not found",
        });
      }

      // ======================================
      // NORMALIZE ROLE
      // ======================================

      const userRole = String(req.user.role).trim().toLowerCase();

      const allowedRoles = roles.map((role) =>
        String(role).trim().toLowerCase(),
      );

      console.log("USER ROLE:", userRole);

      console.log("ALLOWED:", allowedRoles);

      // ======================================
      // ACCESS CHECK
      // ======================================

      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,

          message: "Access Denied",
        });
      }

      next();
    } catch (error) {
      console.log("ROLE MIDDLEWARE ERROR:", error);

      return res.status(500).json({
        success: false,

        message: "Middleware Failed",
      });
    }
  };
};

module.exports = roleMiddleware;
