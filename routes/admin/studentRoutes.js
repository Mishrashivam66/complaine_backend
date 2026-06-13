const express = require("express");

const router = express.Router();

const {
  getStudents,
  deleteStudent,
} = require("../../controllers/admin/studentController");

// ======================================
// GET ALL STUDENTS
// ======================================

router.get("/", getStudents);

// ======================================
// DELETE STUDENT
// ======================================

router.delete("/:id", deleteStudent);

module.exports = router;
