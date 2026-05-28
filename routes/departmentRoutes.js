const express = require("express");

const {
  createDepartment,
  getDepartments,
  deleteDepartment,
} = require("../controllers/departmentController");

const router = express.Router();

router.post("/", createDepartment);

router.get("/", getDepartments);

router.delete("/:id", deleteDepartment);

module.exports = router;