"use strict";

const User = require("../../models/User");
const AuditLog = require("../../models/AuditLog");
const generateToken = require("../../utils/generateToken");
const sendEmail = require("../../utils/sendEmail");

const STUDENT_EMAIL_DOMAINS = new Set(["s.amity.edu", "gwa.amity.edu"]);

// ==========================================
// COMMON HELPERS
// ==========================================

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

// Never return password or reset tokens.
function publicUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,

    assignedBlock: user.assignedBlock,
    departmentBlock: user.departmentBlock,

    department: user.department,
    designation: user.designation,
    employeeId: user.employeeId,

    shift: user.shift,
    status: user.status,
    currentJobs: user.currentJobs,
    maxJobs: user.maxJobs,

    hostel: user.hostel,
    floor: user.floor,
    pocket: user.pocket,
    roomNumber: user.roomNumber,
    assignedHostel: user.assignedHostel,

    isApproved: user.isApproved,
    permissionPending: user.permissionPending,
    isHosteller: user.isHosteller,
    profileEditLocked: user.profileEditLocked,
  };
}

// ==========================================
// PUBLIC STUDENT REGISTRATION
// ==========================================

const registerUser = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      hostel,
      floor,
      pocket,
      roomNumber,
      isHosteller,
      amizoneId,
    } = req.body || {};

    const cleanEmail = normalizeEmail(email);

    if (
      typeof name !== "string" ||
      !name.trim() ||
      !cleanEmail ||
      typeof password !== "string" ||
      password.length < 8
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid name, email and password (at least 8 characters) required",
      });
    }

    const domain = cleanEmail.split("@")[1];

    if (!STUDENT_EMAIL_DOMAINS.has(domain)) {
      return res.status(400).json({
        success: false,
        message: "Use an authorized Amity email address",
      });
    }

    if (await User.exists({ email: cleanEmail })) {
      return res.status(409).json({
        success: false,
        message: "User already exists",
      });
    }

    const hosteller = isHosteller === true || isHosteller === "true";

    const legacyHostelCodes = {
      "Boys Hostel H1": "H1",
      "Boys Hostel H4": "H4",
      "Girls Hostel H2": "H2",
      "Girls Hostel H3": "H3",
      "Faculty Hostel H5": "H5",
    };

    const rawHostel = typeof hostel === "string" ? hostel.trim() : "";

    const hostelCode = legacyHostelCodes[rawHostel] || rawHostel;

    // Public registration ALWAYS creates STUDENT.
    // Never accept role from the request body.

    const user = await User.create({
      name: name.trim(),
      email: cleanEmail,
      password,
      role: "STUDENT",

      phone: typeof phone === "string" ? phone.trim() : "",

      ...(typeof amizoneId === "string" && amizoneId.trim()
        ? {
            amizoneId: amizoneId.trim(),
          }
        : {}),

      hostel: hosteller ? hostelCode : "",

      floor: hosteller && typeof floor === "string" ? floor.trim() : "",

      pocket: hosteller && typeof pocket === "string" ? pocket.trim() : "",

      roomNumber:
        hosteller && typeof roomNumber === "string" ? roomNumber.trim() : "",

      isHosteller: hosteller,

      permissionPending: hosteller,
      isApproved: !hosteller,
      isVerified: false,
    });

    const otp = user.generateEmailOTP();

    await user.save();

    await sendEmail(
      user.email,
      "AmiMaintain Email Verification OTP",
      `<h2>AmiMaintain</h2>
       <p>Your email verification OTP:</p>
       <h1>${otp}</h1>
       <p>This OTP expires in 15 minutes.</p>`,
    );

    return res.status(201).json({
      success: true,
      message: "Registration successful. Verification email sent.",
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error?.name, error?.code);

    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Account identifier already exists",
      });
    }

    if (error?.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Registration failed. Please try again.",
    });
  }
};

// ==========================================
// LOGIN USER
// SUPPORTS TECHNICIAN + EXISTING ROLES
// ==========================================

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    const cleanEmail = normalizeEmail(email);

    if (!cleanEmail || typeof password !== "string" || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find existing User account.
    const user = await User.findOne({
      email: cleanEmail,
    });

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // ======================================
    // BLOCK LEGACY SHARED-PASSWORD WORKERS
    // ======================================

    // Old WORKER accounts were created with
    // a shared default password.
    // Manager must migrate them to TECHNICIAN.

    if (user.role === "WORKER") {
      return res.status(403).json({
        success: false,
        message:
          "Please contact the Maintenance Manager to activate your Technician login.",
      });
    }

    // ======================================
    // ACCOUNT ACCESS
    // ======================================

    if (user.isActive === false || user.isDeleted === true) {
      return res.status(403).json({
        success: false,
        message: "Account disabled",
      });
    }

    // ======================================
    // EMAIL VERIFICATION
    // ======================================

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email first",
      });
    }

    // ======================================
    // STUDENT HOSTEL APPROVAL
    // ======================================

    if (
      user.role === "STUDENT" &&
      user.isHosteller &&
      (user.permissionPending === true || user.isApproved === false)
    ) {
      return res.status(403).json({
        success: false,
        message: "Your hostel request is pending warden approval",
      });
    }

    // ======================================
    // LOGIN ACTIVITY
    // ======================================

    user.lastLogin = new Date();

    await user.save();

    const token = generateToken(user._id);

    try {
      await AuditLog.create({
        user: user.name,
        role: user.role,
        action: `${user.role} logged into ERP system`,
        type: "LOGIN",
        time: "Just Now",
      });
    } catch (auditError) {
      console.error("LOGIN AUDIT ERROR:", auditError);
    }

    // ======================================
    // SUCCESS RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,

      // Includes role, department, shift and
      // status for the Technician dashboard.
      user: publicUser(user),
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
};

// ==========================================
// GET MY PROFILE
// ==========================================

const getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "name email role phone hostel floor pocket roomNumber assignedHostel " +
        "assignedBlock departmentBlock department designation employeeId " +
        "shift status currentJobs maxJobs isApproved permissionPending " +
        "isHosteller profileEditLocked isActive isVerified createdAt updatedAt",
    );

    if (!user || user.isActive === false || user.isDeleted === true) {
      return res.status(404).json({
        success: false,
        message: "User not found or account disabled",
      });
    }

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("PROFILE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load profile",
    });
  }
};

// ==========================================
// UPDATE PROFILE
// PRESERVES STUDENT HOSTEL APPROVAL RULES
// ==========================================

const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user || user.isActive === false || user.isDeleted === true) {
      return res.status(404).json({
        success: false,
        message: "User not found or account disabled",
      });
    }

    if (user.profileEditLocked) {
      return res.status(403).json({
        success: false,
        message: "Profile editing locked by Warden",
      });
    }

    // Name and phone for authenticated users.
    if (typeof req.body?.name === "string" && req.body.name.trim()) {
      user.name = req.body.name.trim();
    }

    if (typeof req.body?.phone === "string") {
      user.phone = req.body.phone.trim();
    }

    // Hostel-related profile updates apply
    // only to Student accounts.
    if (user.role === "STUDENT") {
      const hostelFields = ["hostel", "floor", "pocket", "roomNumber"];

      const changedHostelFields = hostelFields.some((field) => {
        if (!Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
          return false;
        }

        const incoming = req.body[field];

        if (typeof incoming !== "string") {
          return false;
        }

        const trimmed = incoming.trim();

        if (user[field] === trimmed) {
          return false;
        }

        user[field] = trimmed;

        return true;
      });

      if (user.isHosteller && changedHostelFields) {
        user.permissionPending = true;
        user.isApproved = false;
        user.profileEditLocked = true;
      }
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",

      user: publicUser(user),
    });
  } catch (error) {
    console.error("UPDATE PROFILE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update profile",
    });
  }
};

// ==========================================
// VERIFY EMAIL OTP
// ==========================================

const verifyEmailOTP = async (req, res) => {
  try {
    const { email, otp } = req.body || {};

    const user = await User.findOne({
      email: normalizeEmail(email),
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (
      !user.emailOTP ||
      !user.emailOTPExpire ||
      user.emailOTP !== String(otp) ||
      user.emailOTPExpire < Date.now()
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    user.isVerified = true;
    user.emailOTP = null;
    user.emailOTPExpire = null;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    console.error("VERIFY OTP ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Verification failed",
    });
  }
};

// ==========================================
// RESEND EMAIL OTP
// ==========================================

const resendOTP = async (req, res) => {
  try {
    const user = await User.findOne({
      email: normalizeEmail(req.body?.email),
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const otp = user.generateEmailOTP();

    await user.save();

    await sendEmail(
      user.email,
      "AmiMaintain Email Verification OTP",
      `<h2>AmiMaintain</h2>
       <p>Your New OTP:</p>
       <h1>${otp}</h1>
       <p>This OTP expires in 15 minutes.</p>`,
    );

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error) {
    console.error("RESEND OTP ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to resend OTP",
    });
  }
};

// ==========================================
// EXPORT CONTROLLERS
// ==========================================

module.exports = {
  registerUser,
  loginUser,
  getMyProfile,
  updateProfile,
  verifyEmailOTP,
  resendOTP,
};
