const mongoose = require("mongoose");

// ==========================================
// CATEGORY SCHEMA
// ==========================================

const categorySchema = new mongoose.Schema(
  {
    // ==========================================
    // CATEGORY NAME
    // ==========================================

    categoryName: {
      type: String,

      required: true,

      trim: true,

      unique: true,
    },

    // ==========================================
    // DEPARTMENT
    // ==========================================

    department: {
      type: String,

      enum: ["MAINTENANCE", "HOSTEL", "SECURITY", "MESS", "IT", "ADMIN"],

      default: "MAINTENANCE",
    },

    // ==========================================
    // PRIORITY
    // ==========================================

    priority: {
      type: String,

      enum: ["LOW", "MEDIUM", "HIGH"],

      default: "MEDIUM",
    },

    // ==========================================
    // ICON
    // ==========================================

    icon: {
      type: String,

      default: "Wrench",
    },

    // ==========================================
    // DESCRIPTION
    // ==========================================

    description: {
      type: String,

      default: "",
    },

    // ==========================================
    // SUB CATEGORIES
    // ==========================================

    subCategories: [
      {
        type: String,
      },
    ],

    // ==========================================
    // STATUS
    // ==========================================

    isActive: {
      type: Boolean,

      default: true,
    },

    // ==========================================
    // TOTAL COMPLAINTS
    // ==========================================

    totalComplaints: {
      type: Number,

      default: 0,
    },
  },

  {
    timestamps: true,
  },
);

// ==========================================
// EXPORT
// ==========================================

module.exports = mongoose.model("Category", categorySchema);
