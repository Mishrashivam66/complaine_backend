const mongoose = require("mongoose");

const rolePermissionSchema = new mongoose.Schema(
  {
    roleName: {
      type: String,

      required: true,

      unique: true,

      trim: true,
    },

    permissions: [
      {
        type: String,
      },
    ],

    isSystemRole: {
      type: Boolean,

      default: false,
    },

    isActive: {
      type: Boolean,

      default: true,
    },
  },

  {
    timestamps: true,
  },
);

// ======================================
// EXPORT
// ======================================

module.exports = mongoose.model(
  "RolePermission",

  rolePermissionSchema,
);
