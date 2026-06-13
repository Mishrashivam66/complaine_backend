const mongoose = require("mongoose");

const complaintAnalyticsSchema = new mongoose.Schema({
  date: Date,

  totalComplaints: Number,

  resolvedComplaints: Number,

  pendingComplaints: Number,

  overdueComplaints: Number,

  avgResolutionTime: Number,

  resolutionRate: Number,
});

module.exports = mongoose.model("ComplaintAnalytics", complaintAnalyticsSchema);
