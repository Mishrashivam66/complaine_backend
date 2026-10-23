"use strict";

const mongoose = require("mongoose");
const User = require("../models/User");

const Restriction = require("../models/StudentComplaintRestriction");

const CATEGORIES = new Set([
  "ABUSIVE_LANGUAGE",
  "FALSE_COMPLAINT",
  "MISUSE",
  "OTHER",
]);

const normalizeHostel = (input) => {
  const value = String(input || "")
    .trim()
    .toUpperCase();

  const matched = value.match(/\bH\d+[A-Z]?\b/);

  return matched ? matched[0] : value;
};

const normalizeBlock = (input) =>
  String(input || "")
    .trim()
    .toUpperCase()
    .replace(/^(?:ACADEMIC\s+)?BLOCK\s*[-:]?\s*/, "")
    .trim();

const summary = (record) => ({
  complaintAccessBlocked: Boolean(record?.isBlocked),

  complaintBlockReason: record?.isBlocked ? record.blockReason : "",

  complaintBlockCategory: record?.isBlocked ? record.blockCategory : "",

  complaintBlockedAt: record?.isBlocked ? record.blockedAt : null,

  complaintBlockedBy: record?.isBlocked ? record.blockedBy : null,
});

// ==========================================
// ADMIN: GET STUDENT COMPLAINT ACCESS
// ==========================================

exports.getStudentAccess = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid student ID",
      });
    }

    const student = await User.findOne({
      _id: req.params.id,
      role: "STUDENT",
    })
      .select("name email isHosteller hostel block departmentBlock")
      .lean();

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    const record = await Restriction.findOne({
      student: student._id,
    })
      .populate("history.actor", "name role")
      .populate("blockedBy", "name role")
      .lean();

    return res.json({
      success: true,
      student,
      ...summary(record),
      history: record?.history || [],
    });
  } catch (error) {
    console.error("GET STUDENT COMPLAINT ACCESS:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load complaint access",
    });
  }
};

// ==========================================
// ADMIN: BLOCK / UNBLOCK
// ==========================================

exports.changeStudentAccess = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid student ID",
      });
    }

    const student = await User.findOne({
      _id: req.params.id,
      role: "STUDENT",
    })
      .select("_id name")
      .lean();

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    const action = String(req.body?.action || "")
      .trim()
      .toUpperCase();

    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

    const category = String(req.body?.category || "OTHER").toUpperCase();

    if (!["BLOCK", "UNBLOCK"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Action must be BLOCK or UNBLOCK",
      });
    }

    if (reason.length < 10 || reason.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Reason must be 10–500 characters",
      });
    }

    if (!CATEGORIES.has(category)) {
      return res.status(400).json({
        success: false,
        message: "Invalid reason category",
      });
    }

    let record = await Restriction.findOne({
      student: student._id,
    });

    if (!record) {
      record = new Restriction({
        student: student._id,
      });
    }

    const nextBlocked = action === "BLOCK";

    if (Boolean(record.isBlocked) === nextBlocked) {
      return res.status(409).json({
        success: false,

        message: nextBlocked
          ? "Student is already complaint-blocked"
          : "Student is not complaint-blocked",
      });
    }

    const now = new Date();

    record.isBlocked = nextBlocked;

    record.blockReason = nextBlocked ? reason : "";

    record.blockCategory = nextBlocked ? category : "OTHER";

    record.blockedBy = nextBlocked ? req.user._id : null;

    record.blockedAt = nextBlocked ? now : null;

    // Permanent audit history.
    record.history.push({
      action,
      reason,
      category,
      actor: req.user._id,
      at: now,
    });

    await record.save();

    return res.json({
      success: true,

      message: nextBlocked
        ? "Student complaint submission blocked"
        : "Student complaint submission restored",

      ...summary(record),
    });
  } catch (error) {
    if (error?.code === 11000 || error?.name === "VersionError") {
      return res.status(409).json({
        success: false,
        message: "Record changed. Refresh and retry.",
      });
    }

    console.error("CHANGE STUDENT COMPLAINT ACCESS:", error);

    return res.status(500).json({
      success: false,
      message: "Could not change complaint access",
    });
  }
};

// ==========================================
// STUDENT: MY COMPLAINT ACCESS
// ==========================================

exports.myComplaintAccess = async (req, res) => {
  try {
    const record = await Restriction.findOne({
      student: req.user._id,
    }).lean();

    return res.json({
      success: true,
      ...summary(record),
    });
  } catch (error) {
    console.error("MY COMPLAINT ACCESS:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load complaint access",
    });
  }
};

// ==========================================
// WARDEN / BLOCK ADMIN READ-ONLY VIEW
// ==========================================

exports.visibleBlockedStudents = async (req, res) => {
  try {
    const role = req.user.role;

    const isWarden = role === "WARDEN";

    const isBlockAdmin = role === "BLOCK_ADMIN";

    if (isWarden && !normalizeHostel(req.user.assignedHostel)) {
      return res.json({
        success: true,
        students: [],
      });
    }

    if (isBlockAdmin && !normalizeBlock(req.user.assignedBlock)) {
      return res.json({
        success: true,
        students: [],
      });
    }

    const candidates = await User.find({
      role: "STUDENT",

      ...(isWarden ? { isHosteller: true } : {}),

      ...(isBlockAdmin
        ? {
            isHosteller: {
              $ne: true,
            },
          }
        : {}),
    })
      .select(
        "_id name email isHosteller hostel block departmentBlock department",
      )
      .lean();

    const inScope = candidates.filter((student) => {
      if (isWarden) {
        return (
          normalizeHostel(student.hostel) ===
          normalizeHostel(req.user.assignedHostel)
        );
      }

      if (isBlockAdmin) {
        return (
          normalizeBlock(student.departmentBlock || student.block) ===
          normalizeBlock(req.user.assignedBlock)
        );
      }

      return role === "ADMIN";
    });

    const restrictions = await Restriction.find({
      student: {
        $in: inScope.map((user) => user._id),
      },

      isBlocked: true,
    })
      .select("student blockReason blockCategory blockedAt")
      .lean();

    const map = new Map(inScope.map((user) => [String(user._id), user]));

    const students = restrictions.map((record) => {
      const student = map.get(String(record.student));

      return {
        _id: student._id,
        name: student.name,
        email: student.email,

        hostel: isWarden ? student.hostel : undefined,

        academicBlock: isBlockAdmin
          ? student.departmentBlock || student.block
          : undefined,

        department: student.department,

        complaintAccessBlocked: true,

        complaintBlockReason: record.blockReason,

        complaintBlockCategory: record.blockCategory,

        complaintBlockedAt: record.blockedAt,
      };
    });

    return res.json({
      success: true,
      students,
    });
  } catch (error) {
    console.error("VISIBLE RESTRICTED STUDENTS:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load restricted students",
    });
  }
};
