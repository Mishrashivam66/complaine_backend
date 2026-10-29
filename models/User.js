"use strict";

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

// ==========================================
// USER SCHEMA
// ==========================================

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: function () {
        return this.role === "STUDENT";
      },
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: function (email) {
          if (this.role !== "STUDENT") return true;

          const allowedDomains = ["s.amity.edu", "gwa.amity.edu"];

          if (!email || !email.includes("@")) {
            return false;
          }

          const domain = email.split("@")[1];

          return allowedDomains.includes(domain);
        },
        message:
          "Only @s.amity.edu and @gwa.amity.edu email addresses are allowed",
      },
    },

    amizoneId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },

    password: {
      type: String,
      required: true,
    },

    phone: {
      type: String,
      default: "",
    },

    profilePhoto: {
      type: String,
      default: "",
    },

    // ======================================
    // ROLE MANAGEMENT
    // ======================================

    role: {
      type: String,
      enum: [
        "ADMIN",
        "BLOCK_ADMIN",
        "HOSTEL_DIRECTOR",
        "WARDEN",
        "MAINTENANCE_MANAGER",
        "STORE_MANAGER",
        "TECHNICIAN",
        "WORKER",
        "STUDENT",
        "FACULTY",
        "ADMIN_STAFF",
        "HOUSEKEEPING_HEAD",
        "IT_HEAD",
        "MESS_MANAGER",
      ],
      default: "STUDENT",
    },

    // ======================================
    // PERMANENT TECHNICIAN ID
    // ======================================

    // Example: TECH-0001
    //
    // MongoDB _id remains the permanent
    // internal account identifier.
    //
    // technicianId is the public-facing
    // Technician identification number.
    //
    // The Technician creation controller
    // must generate this ID once.
    //
    // Existing Technician records may
    // temporarily have no technicianId.

    technicianId: {
      type: String,
      trim: true,
      uppercase: true,
      default: undefined,
      validate: {
        validator: function (value) {
          if (!value) return true;

          return /^TECH-\d{4,}$/.test(value);
        },
        message: "Technician ID must follow TECH-0001 format",
      },
    },

    // ======================================
    // DEPARTMENT
    // ======================================

    department: {
      type: String,
      default: "",
    },

    departmentBlock: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    // ======================================
    // TECHNICIAN STATUS
    // ======================================

    shift: {
      type: String,
      enum: ["DAY", "NIGHT", "24x7"],
      default: "DAY",
    },

    status: {
      type: String,
      enum: ["ACTIVE", "BUSY", "OFFLINE", "ON_LEAVE"],
      default: "ACTIVE",
    },

    currentJobs: {
      type: Number,
      default: 0,
      min: 0,
    },

    maxJobs: {
      type: Number,
      default: 10,
      min: 0,
    },

    // ======================================
    // STUDENT STATUS
    // ======================================

    studentStatus: {
      type: String,
      enum: ["ACTIVE", "PENDING", "LEFT_HOSTEL"],
      default: function () {
        return this.isHosteller ? "PENDING" : "ACTIVE";
      },
    },

    // ======================================
    // HOSTEL INFORMATION
    // ======================================

    floor: {
      type: String,
    },

    pocket: {
      type: String,
    },

    isHosteller: {
      type: Boolean,
      default: false,
    },

    hostel: {
      type: String,
      default: "",
    },

    block: {
      type: String,
      default: "",
    },

    roomNumber: {
      type: String,
      default: "",
    },

    parentPhone: {
      type: String,
      default: "",
    },

    emergencyContact: {
      type: String,
      default: "",
    },

    // ======================================
    // STAFF ASSIGNMENTS
    // ======================================

    assignedHostel: {
      type: String,
      default: "",
    },

    assignedBlock: {
      type: String,
      uppercase: true,
      trim: true,
      default: "",
      validate: {
        validator: function (value) {
          return this.role !== "BLOCK_ADMIN" || Boolean(value && value.trim());
        },
        message: "Block Admin requires an assigned block",
      },
    },

    designation: {
      type: String,
      default: "",
    },

    employeeId: {
      type: String,
      trim: true,
      default: "",
    },

    assignedWarden: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ======================================
    // APPROVAL FLOW
    // ======================================

    isApproved: {
      type: Boolean,
      default: function () {
        return !this.isHosteller;
      },
    },

    permissionPending: {
      type: Boolean,
      default: false,
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    // ======================================
    // ACCOUNT STATUS
    // ======================================

    isActive: {
      type: Boolean,
      default: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    lastLogin: {
      type: Date,
      default: null,
    },

    // ======================================
    // EMAIL VERIFICATION
    // ======================================

    isVerified: {
      type: Boolean,
      default: false,
    },

    verificationToken: {
      type: String,
      default: null,
    },

    verificationTokenExpire: {
      type: Date,
      default: null,
    },

    // ======================================
    // PROFILE SETTINGS
    // ======================================

    profileEditLocked: {
      type: Boolean,
      default: false,
    },

    // ======================================
    // ACADEMIC INFORMATION
    // ======================================

    course: {
      type: String,
      default: "",
    },

    year: {
      type: String,
      default: "",
    },

    semester: {
      type: String,
      default: "",
    },

    section: {
      type: String,
      default: "",
    },

    emailOTP: {
      type: String,
      default: null,
    },

    emailOTPExpire: {
      type: Date,
      default: null,
    },

    // ======================================
    // PASSWORD RESET
    // ======================================

    resetPasswordToken: {
      type: String,
      default: null,
    },

    resetPasswordExpires: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// ==========================================
// UNIQUE TECHNICIAN ID INDEX
// ==========================================

// Partial unique index:
// Only non-empty technicianId values
// participate in uniqueness checks.
//
// Existing accounts without technicianId
// are not affected.

userSchema.index(
  { technicianId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      technicianId: {
        $type: "string",
        $gt: "",
      },
    },
  },
);

// ==========================================
// HASH PASSWORD BEFORE SAVE
// ==========================================

userSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }

  const salt = await bcrypt.genSalt(10);

  this.password = await bcrypt.hash(this.password, salt);
});

// ==========================================
// MATCH PASSWORD
// ==========================================

userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// ==========================================
// GENERATE EMAIL OTP
// ==========================================

userSchema.methods.generateEmailOTP = function () {
  const otp = crypto.randomInt(100000, 1000000).toString();

  this.emailOTP = otp;

  this.emailOTPExpire = new Date(Date.now() + 15 * 60 * 1000);

  return otp;
};

// ==========================================
// GENERATE PASSWORD RESET TOKEN
// ==========================================

userSchema.methods.generateResetPasswordToken = function () {
  const token = crypto.randomBytes(32).toString("hex");

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  this.resetPasswordToken = hashedToken;

  this.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);

  return token;
};

// ==========================================
// EXPORT
// ==========================================

module.exports = mongoose.model("User", userSchema);
