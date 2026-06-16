const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

// ==========================================
// USER SCHEMA
// ==========================================

const userSchema = new mongoose.Schema(
  {
    // ==========================================
    // BASIC INFORMATION
    // ==========================================

    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,

      validate: {
        validator: function (email) {
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

    // ==========================================
    // ROLE MANAGEMENT
    // ==========================================

    role: {
      type: String,

      enum: [
        "ADMIN",
        "WARDEN",
        "MAINTENANCE_MANAGER",
        "STORE_MANAGER",
        "HOUSEKEEPING_HEAD",
        "IT_HEAD",
        "WORKER",
        "STUDENT",
        "FACULTY",
        "ADMIN_STAFF",
        "MESS_MANAGER",
      ],

      default: "STUDENT",
    },

    // ==========================================
    // DEPARTMENT
    // ==========================================

    department: {
      type: String,
      default: "",
    },

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
    },

    maxJobs: {
      type: Number,
      default: 10,
    },

    studentStatus: {
      type: String,

      enum: ["ACTIVE", "PENDING", "LEFT_HOSTEL"],

      default: function () {
        if (this.isHosteller) {
          return "PENDING";
        }

        return "ACTIVE";
      },
    },

    floor: {
      type: String,
    },

    pocket: {
      type: String,
    },

    // ==========================================
    // STUDENT INFORMATION
    // ==========================================

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

    // ==========================================
    // WARDEN / STAFF ASSIGNMENT
    // ==========================================

    assignedHostel: {
      type: String,
      default: "",
    },

    designation: {
      type: String,
      default: "",
    },

    employeeId: {
      type: String,
      default: "",
    },

    assignedWarden: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ==========================================
    // APPROVAL FLOW
    // ==========================================

    isApproved: {
      type: Boolean,

      default: function () {
        if (this.isHosteller) {
          return false;
        }

        return true;
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

    // ==========================================
    // ACCOUNT STATUS
    // ==========================================

    isActive: {
      type: Boolean,
      default: true,
    },

    lastLogin: {
      type: Date,
      default: null,
    },

    // ==========================================
    // EMAIL VERIFICATION
    // ==========================================

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

    // ==========================================
    // PROFILE SETTINGS
    // ==========================================

    profileEditLocked: {
      type: Boolean,
      default: false,
    },

    // ==========================================
    // ACADEMIC INFORMATION
    // ==========================================

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

    // ==========================================
    // PASSWORD RESET
    // ==========================================

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
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.generateEmailOTP = function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

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
// EXPORT MODEL
// ==========================================

module.exports = mongoose.model("User", userSchema);
