const AuditLog = require("../../models/AuditLog");

// ======================================
// GET LOGS
// ======================================

exports.getAuditLogs = async (req, res) => {
  try {
    const logs = await AuditLog.find()

      .sort({
        createdAt: -1,
      });

    res.status(200).json({
      success: true,
      logs,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch logs",
    });
  }
};

// ======================================
// CREATE LOG
// ======================================

exports.createAuditLog = async (req, res) => {
  try {
    const {
      user,

      role,

      action,

      type,
    } = req.body;

    const log = await AuditLog.create({
      user,

      role,

      action,

      type,
    });

    res.status(201).json({
      success: true,
      log,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Failed to create log",
    });
  }
};
