"use strict";

const mongoose = require("mongoose");

const User = require("../../models/User");
const Hostel = require("../../models/Hostel");

const StudentComplaintRestriction = require("../../models/StudentComplaintRestriction");

// ==========================================
// SAFE STUDENT FIELDS
// ==========================================

// Never return password, OTP, reset tokens,
// refresh tokens, or private auth secrets.

const STUDENT_FIELDS = [
  "_id",
  "name",
  "email",
  "amizoneId",
  "enrollmentNumber",
  "rollNumber",
  "phone",
  "mobileNumber",
  "role",
  "isHosteller",
  "hostel",
  "roomNumber",
  "department",
  "departmentBlock",
  "assignedBlock",
  "block",
  "course",
  "program",
  "year",
  "batch",
  "semester",
  "section",
  "studentStatus",
  "academicStatus",
  "isActive",
  "isDeleted",
  "isApproved",
  "createdAt",
  "updatedAt",
].join(" ");

// ==========================================
// HOSTEL CODE NORMALIZATION
// ==========================================

const getHostelCode = (value) => {
  if (!value) return "";

  const raw = String(value).trim().toUpperCase();

  const match = raw.match(/\bH\d+[A-Z]?\b/);

  return match ? match[0] : raw;
};

// ==========================================
// GET ALL STUDENTS
// ==========================================

exports.getStudents = async (req, res) => {
  try {
    // ======================================
    // FETCH STUDENTS
    // ======================================

    const students = await User.find({
      role: "STUDENT",
    })
      .select(STUDENT_FIELDS)
      .sort({ createdAt: -1 })
      .lean();

    // ======================================
    // FETCH BLOCK RESTRICTIONS
    // ======================================

    const restrictions = await StudentComplaintRestriction.find({
      student: {
        $in: students.map((student) => student._id),
      },
      isBlocked: true,
    })
      .select("student blockReason blockCategory blockedAt blockedBy")
      .lean();

    const restrictionMap = new Map(
      restrictions.map((item) => [String(item.student), item]),
    );

    // ======================================
    // ENRICH STUDENT DETAILS
    // ======================================

    const enrichedStudents = students.map((student) => {
      const restriction = restrictionMap.get(String(student._id));

      return {
        ...student,

        complaintAccessBlocked: Boolean(restriction),

        complaintBlockReason: restriction?.blockReason || "",

        complaintBlockCategory: restriction?.blockCategory || "",

        complaintBlockedAt: restriction?.blockedAt || null,

        complaintBlockedBy: restriction?.blockedBy || null,
      };
    });

    // ======================================
    // EXISTING STUDENT STATUS STATS
    // ======================================

    const activeStudents = students.filter(
      (student) => student.studentStatus === "ACTIVE",
    ).length;

    const pendingStudents = students.filter(
      (student) => student.studentStatus === "PENDING",
    ).length;

    const leftStudents = students.filter(
      (student) => student.studentStatus === "LEFT_HOSTEL",
    ).length;

    // ======================================
    // HOSTELLER / DAY SCHOLAR COUNTS
    // ======================================

    const hostellerStudents = students.filter(
      (student) => student.isHosteller === true,
    ).length;

    const nonHostellerStudents = students.filter(
      (student) => student.isHosteller === false,
    ).length;

    const totalStudents = students.length;

    // ======================================
    // COMPLAINT BLOCKED STUDENTS
    // ======================================

    const complaintBlockedStudents = restrictions.length;

    // ======================================
    // ACCOUNT STATS
    // ======================================

    const activeAccounts = students.filter(
      (student) => student.isActive !== false && student.isDeleted !== true,
    ).length;

    const inactiveAccounts = students.filter(
      (student) => student.isActive === false || student.isDeleted === true,
    ).length;

    // ======================================
    // DYNAMIC HOSTEL MASTER
    // ======================================

    const hostels = await Hostel.find({})
      .select("hostelCode hostelName isActive isDeleted")
      .lean();

    const hostelMap = new Map();

    // First add all configured hostels.

    for (const hostel of hostels) {
      const code = getHostelCode(hostel.hostelCode || hostel.hostelName);

      if (!code) continue;

      hostelMap.set(code, {
        hostel: code,

        hostelName: hostel.hostelName || code,

        count: 0,
      });
    }

    // ======================================
    // COUNT STUDENTS PER HOSTEL
    // ======================================

    for (const student of students) {
      if (
        student.isHosteller !== true ||
        !student.hostel ||
        student.studentStatus === "LEFT_HOSTEL"
      ) {
        continue;
      }

      const code = getHostelCode(student.hostel);

      if (!code) continue;

      if (!hostelMap.has(code)) {
        hostelMap.set(code, {
          hostel: code,
          hostelName: String(student.hostel),
          count: 0,
        });
      }

      const entry = hostelMap.get(code);

      entry.count += 1;
    }

    const hostelAnalytics = [...hostelMap.values()].sort((a, b) =>
      a.hostel.localeCompare(b.hostel, undefined, { numeric: true }),
    );

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      students: enrichedStudents,

      stats: {
        activeStudents,
        pendingStudents,
        leftStudents,

        hostellerStudents,
        nonHostellerStudents,

        totalStudents,

        complaintBlockedStudents,

        activeAccounts,
        inactiveAccounts,
      },

      hostelAnalytics,
    });
  } catch (error) {
    console.error("ADMIN GET STUDENTS ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Unable to fetch student records",
    });
  }
};

// ==========================================
// REMOVE STUDENT - HISTORY SAFE
// ==========================================

// Do not permanently delete a student.
// This route is retained for compatibility,
// but destructive deletion is disabled.

exports.deleteStudent = async (req, res) => {
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
    }).select("_id");

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    return res.status(409).json({
      success: false,

      message:
        "Permanent student deletion is disabled. Use the Admin complaint-blocking feature to restrict new complaints. Graduated and historical students should be managed through a separate academic-status workflow.",
    });
  } catch (error) {
    console.error("ADMIN STUDENT DELETE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to process student request",
    });
  }
};
