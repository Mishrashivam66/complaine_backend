const RolePermission = require("../../models/RolePermission");

const User = require("../../models/User");

// ======================================
// GET ALL ROLES
// ======================================

exports.getRoles = async (req, res) => {
  try {
    // ======================================
    // GET UNIQUE USER ROLES
    // ======================================

    const userRoles = await User.distinct("role");

    // ======================================
    // AUTO CREATE ROLES
    // ======================================

    for (const roleName of userRoles) {
      const existingRole = await RolePermission.findOne({
        roleName,
      });

      if (!existingRole) {
        await RolePermission.create({
          roleName,

          permissions: [],
        });
      }
    }

    // ======================================
    // FETCH ALL ROLES
    // ======================================

    const roles = await RolePermission.find()

      .sort({
        createdAt: -1,
      });

    res.status(200).json({
      success: true,

      roles,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to fetch roles",
    });
  }
};

// ======================================
// CREATE ROLE
// ======================================

exports.createRole = async (req, res) => {
  try {
    const {
      roleName,

      permissions,
    } = req.body;

    // ======================================
    // CHECK EXISTING ROLE
    // ======================================

    const existingRole = await RolePermission.findOne({
      roleName,
    });

    if (existingRole) {
      return res.status(400).json({
        success: false,

        message: "Role already exists",
      });
    }

    // ======================================
    // CREATE ROLE
    // ======================================

    const role = await RolePermission.create({
      roleName,

      permissions,
    });

    res.status(201).json({
      success: true,

      message: "Role created successfully",

      role,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to create role",
    });
  }
};

// ======================================
// DELETE ROLE
// ======================================

exports.deleteRole = async (req, res) => {
  try {
    const role = await RolePermission.findById(req.params.id);

    if (!role) {
      return res.status(404).json({
        success: false,

        message: "Role not found",
      });
    }

    // ======================================
    // SUPER ADMIN PROTECTION
    // ======================================

    if (role.roleName === "SUPER_ADMIN") {
      return res.status(403).json({
        success: false,

        message: "SUPER_ADMIN cannot be deleted",
      });
    }

    // ======================================
    // DELETE
    // ======================================

    await RolePermission.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,

      message: "Role deleted successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Delete failed",
    });
  }
};

// ======================================
// UPDATE ROLE
// ======================================

exports.updateRole = async (req, res) => {
  try {
    const {
      roleName,

      permissions,
    } = req.body;

    const updatedRole = await RolePermission.findByIdAndUpdate(
      req.params.id,

      {
        roleName,

        permissions,
      },

      {
        new: true,
      },
    );

    res.status(200).json({
      success: true,

      message: "Role updated successfully",

      updatedRole,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Update failed",
    });
  }
};
