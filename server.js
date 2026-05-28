const express = require("express");
const cors = require("cors");
require("dotenv").config();

const http = require("http");

const { initSocket } =
require("./sockets/socket");

const connectDB =
require("./config/db");

const authRoutes =
require("./routes/authRoutes");

const complaintRoutes =
require("./routes/complaintRoutes");

const departmentRoutes =
require("./routes/departmentRoutes");

const categoryRoutes =
require("./routes/categoryRoutes");

const jobCardRoutes =
require("./routes/jobCardRoutes");

const materialRequestRoutes =
require("./routes/materialRequestRoutes");

const inventoryRoutes =
require("./routes/inventoryRoutes");

const reportRoutes =
require("./routes/reportRoutes");

const invoiceRoutes =
require("./routes/invoiceRoutes");

const notificationRoutes =
require("./routes/notificationRoutes");


// Connect DB
connectDB();

const app = express();

app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send(
    "Smart Campus ERP Backend Running 🚀"
  );
});

app.use("/api/auth", authRoutes);

app.use(
  "/api/complaints",
  complaintRoutes
);

app.use(
  "/api/departments",
  departmentRoutes
);

app.use(
  "/api/categories",
  categoryRoutes
);

app.use(
  "/api/jobcards",
  jobCardRoutes
);

app.use(
  "/api/material-requests",
  materialRequestRoutes
);

app.use(
  "/api/inventory",
  inventoryRoutes
);

app.use(
  "/api/reports",
  reportRoutes
);

app.use(
  "/api/invoices",
  invoiceRoutes
);

app.use(
  "/api/notifications",
  notificationRoutes
);
// Create HTTP Server
const server =
http.createServer(app);


// Initialize Socket
initSocket(server);


const PORT =
process.env.PORT || 5000;


// Start Server
server.listen(PORT, () => {

  console.log(
    `Server running on port ${PORT}`
  );

});