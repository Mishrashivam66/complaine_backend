"use strict";

const User = require("../../models/User");

// =====================================================
// AMI MAINT.
// GET ALL WARDENS OF LOGGED-IN STUDENT'S HOSTEL
// =====================================================

// Normalize:
// H1
// Hostel H1
// Boys Hostel H1
// All become H1

function normalizeHostel(value) {
  if (!value) return "";

  const raw = String(value).trim().toUpperCase();

  const match = raw.match(/\bH[\s-]?(\d+[A-Z]?)\b/);

  if (match) {
    return `H${match[1]}`;
  }

  return raw.replace(/[^A-Z0-9]/g, "");
}

// =====================================================
// MATCH ASSIGNED HOSTEL
// =====================================================

function belongsToHostel(assignedHostel, studentHostel) {
  const studentCode = normalizeHostel(studentHostel);

  if (!studentCode) return false;

  const references = Array.isArray(assignedHostel)
    ? assignedHostel
    : [assignedHostel];

  return references.some((value) => {
    const assignedCode = normalizeHostel(value);

    return assignedCode && assignedCode === studentCode;
  });
}

// =====================================================
// GET MY HOSTEL WARDENS
// GET /api/student/hostel/wardens
// =====================================================

exports.getMyHostelWardens = async (req, res) => {
  try {
    const studentId = req.user?._id || req.user?.id;

    if (!studentId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // ===============================================
    // FETCH STUDENT FROM DATABASE
    // Never trust hostel supplied by browser.
    // ===============================================

    const student = await User.findById(studentId)
      .select("role hostel isHosteller isActive isDeleted")
      .lean();

    if (
      !student ||
      student.role !== "STUDENT" ||
      student.isActive === false ||
      student.isDeleted === true
    ) {
      return res.status(403).json({
        success: false,
        message: "Student access only",
      });
    }

    if (!student.isHosteller) {
      return res.status(200).json({
        success: true,
        hostel: null,
        totalWardens: 0,
        wardens: [],
      });
    }

    const hostel = student.hostel;

    if (!hostel || !normalizeHostel(hostel)) {
      return res.status(400).json({
        success: false,
        message: "Student hostel is not registered",
      });
    }

    // ===============================================
    // FETCH ACTIVE WARDENS
    // ===============================================

    const candidates = await User.find({
      role: "WARDEN",
      isActive: {
        $ne: false,
      },
      isDeleted: {
        $ne: true,
      },
    })
      .select("name phone email designation assignedHostel")
      .sort({
        name: 1,
      })
      .lean();

    // ===============================================
    // FILTER SAME HOSTEL ONLY
    // ===============================================

    const wardens = candidates
      .filter((warden) => belongsToHostel(warden.assignedHostel, hostel))
      .map((warden) => ({
        _id: warden._id,
        name: warden.name || "",
        phone: warden.phone || "",
        email: warden.email || "",
        designation: warden.designation || "Hostel Warden",
      }));

    return res.status(200).json({
      success: true,

      hostel,

      totalWardens: wardens.length,

      wardens,
    });
  } catch (error) {
    console.error("GET MY HOSTEL WARDENS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch assigned Hostel Wardens",
    });
  }
};
