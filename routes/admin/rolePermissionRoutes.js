const express = require("express");

const router = express.Router();

const {
  getRoles,

  createRole,

  deleteRole,

  updateRole,
} = require("../../controllers/admin/rolePermissionController");

// ======================================
// GET ALL ROLES
// ======================================

router.get("/all", getRoles);

// ======================================
// CREATE ROLE
// ======================================

router.post("/create", createRole);

// ======================================
// UPDATE ROLE
// ======================================

router.put("/update/:id", updateRole);

// ======================================
// DELETE ROLE
// ======================================

router.delete("/delete/:id", deleteRole);

module.exports = router;
