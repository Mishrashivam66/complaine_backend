const mongoose = require("mongoose");

const bcrypt = require("bcryptjs");

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

      match: [/@.*amity\.edu$/, "Only Amity email allowed"],
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

    studentStatus: {
      type: String,

      enum: ["ACTIVE", "PENDING", "LEFT_HOSTEL"],

      default: function () {
        // HOSTELLER
        if (this.isHosteller) {
          return "PENDING";
        }

        // DAY SCHOLAR
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
        // HOSTELLER NEEDS APPROVAL
        if (this.isHosteller) {
          return false;
        }

        // NORMAL USERS AUTO APPROVED
        return true;
      },
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
    // PROFILE & VERIFICATION
    // ==========================================

    isVerified: {
      type: Boolean,

      default: true,
    },

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

userSchema.pre(
  "save",

  async function () {
    // ==========================================
    // IF PASSWORD NOT MODIFIED
    // ==========================================

    if (!this.isModified("password")) {
      return;
    }

    // ==========================================
    // GENERATE SALT
    // ==========================================

    const salt = await bcrypt.genSalt(10);

    // ==========================================
    // HASH PASSWORD
    // ==========================================

    this.password = await bcrypt.hash(
      this.password,

      salt,
    );
  },
);

// ==========================================
// MATCH PASSWORD METHOD
// ==========================================

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(
    enteredPassword,

    this.password,
  );
};

// ==========================================
// EXPORT MODEL
// ==========================================

module.exports = mongoose.model(
  "User",

  userSchema,
);
