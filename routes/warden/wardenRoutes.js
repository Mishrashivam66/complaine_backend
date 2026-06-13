const express = require("express");

const router = express.Router();

// ==========================================
// IMPORT ROUTES
// ==========================================

const pendingStudentRoutes = require("./pendingStudentRoutes");

const dashboardRoutes = require("./dashboardRoutes");

const manageStudentsRoutes = require("./manageStudentsRoutes");

const studentProfileRoutes = require("./studentProfileRoutes");

const complaintRoutes = require("./complaintRoutes");

const noticeRoutes = require("./noticeRoutes");

const emergencyRoutes = require("./emergencyRoutes");

const escalationRoutes = require("./escalationRoutes");

const reportRoutes = require("./reportRoutes");

const messComplaintRoutes = require("./messComplaintRoutes");

const studentHistoryRoutes = require("./studentHistoryRoutes");

// ==========================================
// TEST ROUTE
// ==========================================

router.get(
  "/",

  (req, res) => {
    res.json({
      success: true,

      message: "Warden Routes Working",
    });
  },
);

// ==========================================
// ROUTES
// ==========================================

router.use(
  "/students",

  pendingStudentRoutes,
);

router.use(
  "/manage-students",

  manageStudentsRoutes,
);

router.use(
  "/student-profile",

  studentProfileRoutes,
);

router.use(
  "/notices",

  noticeRoutes,
);

router.use(
  "/dashboard",

  dashboardRoutes,
);

router.use(
  "/complaints",

  complaintRoutes,
);

router.use(
  "/emergency-alerts",

  emergencyRoutes,
);

router.use(
  "/escalations",

  escalationRoutes,
);

router.use(
  "/reports",

  reportRoutes,
);

router.use(
  "/mess-complaints",

  messComplaintRoutes,
);

router.use(
  "/student-history",

  studentHistoryRoutes,
);

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;
