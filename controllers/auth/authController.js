"use strict";

const User = require("../../models/User");
const AuditLog = require("../../models/AuditLog");
const generateToken = require("../../utils/generateToken");
const sendEmail = require("../../utils/sendEmail");

// ==========================================
// REGISTER USER
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

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      password.length < 8
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid name, email and password (at least 8 characters) required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const emailDomain = normalizedEmail.split("@")[1];

    if (!["s.amity.edu", "gwa.amity.edu"].includes(emailDomain)) {
      return res.status(400).json({
        success: false,
        message: "Use an authorized Amity email address",
      });
    }

    if (
      await User.exists({
        email: normalizedEmail,
      })
    ) {
      return res.status(409).json({
        success: false,
        message: "User already exists",
      });
    }

    const hostellerValue = isHosteller === true || isHosteller === "true";

    // Legacy hostel name compatibility.
    const legacyHostelCodes = {
      "Boys Hostel H1": "H1",
      "Boys Hostel H4": "H4",
      "Girls Hostel H2": "H2",
      "Girls Hostel H3": "H3",
      "Faculty Hostel H5": "H5",
    };

    const hostelCode =
      typeof hostel === "string"
        ? legacyHostelCodes[hostel.trim()] || hostel.trim()
        : "";

    // SECURITY:
    // Public registration always gets STUDENT.
    // Never accept role from request body.

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,

      role: "STUDENT",

      phone: typeof phone === "string" ? phone.trim() : "",

      ...(typeof amizoneId === "string" && amizoneId.trim()
        ? { amizoneId: amizoneId.trim() }
        : {}),

      hostel: hostellerValue ? hostelCode : "",

      floor: hostellerValue && typeof floor === "string" ? floor.trim() : "",

      pocket: hostellerValue && typeof pocket === "string" ? pocket.trim() : "",

      roomNumber:
        hostellerValue && typeof roomNumber === "string"
          ? roomNumber.trim()
          : "",

      isHosteller: hostellerValue,
      permissionPending: hostellerValue,
      isApproved: !hostellerValue,
      isVerified: false,
    });

    const otp = user.generateEmailOTP();

    await user.save();

    const message = `
      <h2>AmiMaintain</h2>
      <p>Your email verification OTP:</p>
      <h1>${otp}</h1>
      <p>This OTP expires in 15 minutes.</p>
    `;

    await sendEmail(user.email, "AmiMaintain Email Verification OTP", message);

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
// ==========================================

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email first",
      });
    }

    if (!user.isActive || user.isDeleted === true) {
      return res.status(403).json({
        success: false,
        message: "Account disabled",
      });
    }

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

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);

    await AuditLog.create({
      user: user.name,
      role: user.role,
      action: `${user.role} logged into ERP system`,
      type: "LOGIN",
      time: "Just Now",
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,

      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        assignedBlock: user.assignedBlock,
        departmentBlock: user.departmentBlock,
        phone: user.phone,
        hostel: user.hostel,
        floor: user.floor,
        pocket: user.pocket,
        roomNumber: user.roomNumber,
        assignedHostel: user.assignedHostel,
        isApproved: user.isApproved,
        permissionPending: user.permissionPending,
        isHosteller: user.isHosteller,
        profileEditLocked: user.profileEditLocked,
      },
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
// GET PROFILE
// ==========================================

const getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "name email role phone hostel floor pocket roomNumber assignedHostel assignedBlock departmentBlock isApproved permissionPending isHosteller profileEditLocked isActive isVerified createdAt updatedAt",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
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
// ==========================================

const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.profileEditLocked) {
      return res.status(403).json({
        success: false,
        message: "Profile editing locked by Warden",
      });
    }

    // Existing profile field behavior.
    user.name = req.body.name || user.name;

    user.phone = req.body.phone || user.phone;

    user.hostel = req.body.hostel || user.hostel;

    user.floor = req.body.floor || user.floor;

    user.pocket = req.body.pocket || user.pocket;

    user.roomNumber = req.body.roomNumber || user.roomNumber;

    // Reapproval only when hostel-related
    // information changes for hostellers.
    const hostelFields = ["hostel", "floor", "pocket", "roomNumber"];

    const changedHostelFields = hostelFields.some(
      (field) =>
        Object.prototype.hasOwnProperty.call(req.body, field) &&
        user.isModified(field),
    );

    if (user.role === "STUDENT" && user.isHosteller && changedHostelFields) {
      user.permissionPending = true;
      user.isApproved = false;
      user.profileEditLocked = true;
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",

      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        hostel: user.hostel,
        floor: user.floor,
        pocket: user.pocket,
        roomNumber: user.roomNumber,
        isHosteller: user.isHosteller,
        permissionPending: user.permissionPending,
        isApproved: user.isApproved,
        profileEditLocked: user.profileEditLocked,
      },
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
      email: typeof email === "string" ? email.trim().toLowerCase() : "",
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
    const { email } = req.body || {};

    const user = await User.findOne({
      email: typeof email === "string" ? email.trim().toLowerCase() : "",
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const otp = user.generateEmailOTP();

    await user.save();

    const message = `
      <h2>AmiMaintain</h2>
      <p>Your New OTP:</p>
      <h1>${otp}</h1>
      <p>This OTP expires in 15 minutes.</p>
    `;

    await sendEmail(user.email, "AmiMaintain Email Verification OTP", message);

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
// EXPORTS
// ==========================================

module.exports = {
  registerUser,
  loginUser,
  getMyProfile,
  updateProfile,
  verifyEmailOTP,
  resendOTP,
};
