const express = require("express");

const cors = require("cors");

const dotenv = require("dotenv");

const http = require("http");

// ==========================================
// SOCKET
// ==========================================

const { initSocket } = require("./sockets/socket");

// ==========================================
// DATABASE
// ==========================================

const connectDB = require("./config/db");

// ==========================================
// ENV CONFIG
// ==========================================

dotenv.config();

// ==========================================
// CONNECT DATABASE
// ==========================================

connectDB();

// ==========================================
// APP
// ==========================================

const app = express();

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(
  cors({
    origin: "*",

    credentials: true,
  }),
);

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  }),
);

// ==========================================
// COMMON NOTIFICATION ROUTES
// ==========================================

// COMPLAINTS

const complaintRoutes = require("./routes/admin/complaintRoutes");

const notificationRoutes = require("./routes/notificationRoutes");

app.use(
  "/api/notifications",

  notificationRoutes,
);

// ==========================================
// ROUTES IMPORT
// ==========================================

// AUTH

const authRoutes = require("./routes/auth/authRoutes");

// ADMIN

const adminRoutes = require("./routes/admin/adminRoutes");

const hostelAdminRoutes = require("./routes/admin/hostelRoutes");

const wardenAdminRoutes = require("./routes/admin/wardenRoutes");

const announcementRoutes = require("./routes/admin/announcementRoutes");
const reportRoutes = require("./routes/admin/reportRoutes");
const inventoryRoutes = require("./routes/admin/inventoryRoutes");
const auditLogRoutes = require("./routes/admin/auditLogRoutes");
const dashboardRoutes = require("./routes/admin/dashboardRoutes");
const rolePermissionRoutes = require("./routes/admin/rolePermissionRoutes");
const messAnalyticsRoutes = require("./routes/mess/messAnalyticsRoutes");

// STUDENT

const studentRoutes = require("./routes/student/studentRoutes");

const profileRoutes = require("./routes/student/profileRoutes");

const hostelRoutes = require("./routes/student/hostelRoutes");

const studentNoticeRoutes = require("./routes/student/noticeRoutes");
// STUDENT MESS

const messRoutes = require("./routes/student/messRoutes");

// WARDEN

const wardenRoutes = require("./routes/warden/wardenRoutes");

const roomAllocationRoutes = require("./routes/warden/roomAllocationRoutes");

// MAINTENANCE

const messMenuRoutes = require("./routes/mess/messMenuRoutes");

const maintenanceRoutes = require("./routes/maintenance/maintenanceRoutes");

// STORE

const storeRoutes = require("./routes/store/storeRoutes");


// COMMON

const commonRoutes = require("./routes/common/commonRoutes");

// ==========================================
// API ROUTES
// ==========================================

// AUTH

app.use(
  "/api/auth",

  authRoutes,
);

// ==========================================
// ADMIN
// ==========================================

app.use(
  "/api/admin",

  adminRoutes,
);

app.use(
  "/api/admin/hostels",

  hostelAdminRoutes,
);

app.use(
  "/api/admin/wardens",

  wardenAdminRoutes,
);

app.use("/api/announcements", announcementRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/complaints", complaintRoutes);

app.use("/api/inventory", inventoryRoutes);

app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/roles", rolePermissionRoutes);

app.use("/api/dashboard", dashboardRoutes);

app.use(
  "/api/mess/menu",

  messMenuRoutes,
);
app.use("/api/mess/analytics", messAnalyticsRoutes);

// ==========================================
// STUDENT
// ==========================================

app.use(
  "/api/student",

  studentRoutes,
);

app.use(
  "/api/student/profile",

  profileRoutes,
);

app.use(
  "/api/student/hostel",

  hostelRoutes,
);

app.use(
  "/api/student/notices",

  studentNoticeRoutes,
);

app.use(
  "/api/student/mess",

  messRoutes,
);

// ==========================================
// WARDEN
// ==========================================

app.use(
  "/api/warden",

  wardenRoutes,
);

app.use(
  "/api/warden/rooms",

  roomAllocationRoutes,
);

// ==========================================
// MAINTENANCE
// ==========================================

app.use(
  "/api/maintenance",

  maintenanceRoutes,
);

// ==========================================
// STORE
// ==========================================

app.use(
  "/api/store",

  storeRoutes,
);

// ==========================================
// COMMON
// ==========================================

app.use(
  "/api/common",

  commonRoutes,
);

// ==========================================
// TEST ROUTE
// ==========================================

app.get(
  "/",

  (req, res) => {
    res.send("SMART CAMPUS ERP BACKEND RUNNING");
  },
);

// ==========================================
// ERROR HANDLER
// ==========================================

app.use((err, req, res, next) => {
  console.log(err.stack);

  res.status(500).json({
    success: false,

    message: err.message || "Server Error",
  });
});

// ==========================================
// HTTP SERVER
// ==========================================

const server = http.createServer(app);

// ==========================================
// INITIALIZE SOCKET
// ==========================================

initSocket(server);

// ==========================================
// PORT
// ==========================================

const PORT = process.env.PORT || 5000;

// ==========================================
// START SERVER
// ==========================================

server.listen(
  PORT,

  () => {
    console.log(`Server running on port ${PORT}`);
  },
);
