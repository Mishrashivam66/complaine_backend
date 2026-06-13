const express = require("express");

const router = express.Router();

// ==========================================
// IMPORT ROUTES
// ==========================================

const dashboardRoutes = require("./dashboardRoutes");

const workerRoutes = require("./workerRoutes");

const assignWorkerRoutes = require("./assignWorkerRoutes");

const jobCardRoutes = require("./jobCardRoutes");

const materialRequestRoutes = require("./materialRequestRoutes");

const reopenComplaintRoutes = require("./reopenComplaintRoutes");

const overdueComplaintRoutes = require("./overdueComplaintRoutes");

const performanceRoutes = require("./performanceRoutes");

const reportRoutes = require("./reportRoutes");

// ==========================================
// DASHBOARD ROUTES
// ==========================================

router.use(
  "/dashboard",

  dashboardRoutes,
);

// ==========================================
// WORKER ROUTES
// ==========================================

router.use(
  "/worker",

  workerRoutes,
);

// ==========================================
// ASSIGN WORKER ROUTES
// ==========================================

router.use(
  "/assign-worker",

  assignWorkerRoutes,
);

// ==========================================
// JOB CARD ROUTES
// ==========================================

router.use(
  "/job-cards",

  jobCardRoutes,
);

// ==========================================
// MATERIAL REQUEST ROUTES
// ==========================================

router.use(
  "/material-requests",

  materialRequestRoutes,
);

// ==========================================
// REOPEN COMPLAINT ROUTES
// ==========================================

router.use(
  "/reopen-complaints",

  reopenComplaintRoutes,
);

// ==========================================
// OVERDUE COMPLAINT ROUTES
// ==========================================

router.use(
  "/overdue-complaints",

  overdueComplaintRoutes,
);

// ==========================================
// PERFORMANCE ROUTES
// ==========================================

router.use(
  "/performance",

  performanceRoutes,
);

// ==========================================
// REPORT ROUTES
// ==========================================

router.use(
  "/reports",

  reportRoutes,
);

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;
