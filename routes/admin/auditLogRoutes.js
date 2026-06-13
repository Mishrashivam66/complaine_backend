const express = require("express");

const router = express.Router();

const {
  getAuditLogs,

  createAuditLog,
} = require("../../controllers/admin/auditLogController");

// ======================================

router.get("/all", getAuditLogs);

router.post("/create", createAuditLog);

module.exports = router;
