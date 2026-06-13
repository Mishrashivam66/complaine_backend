const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  user: {
    type: String,
    required: true,
  },

  role: {
    type: String,
    required: true,
  },

  action: {
    type: String,
    required: true,
  },

  type: {
    type: String,
    required: true,
  },

  time: {
    type: String,
    default: "Just Now",
  },

  createdAt: {
    type: Date,
    default: Date.now,

    // 7 DAYS
    expires: 60 * 60 * 24 * 7,
  },
});

module.exports = mongoose.model("AuditLog", auditLogSchema);
