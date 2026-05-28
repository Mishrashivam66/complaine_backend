const Department = require("../models/Department");

// Create Department
const createDepartment = async (req, res) => {
  try {
    const { name, description } = req.body;

    const departmentExists =
      await Department.findOne({ name });

    if (departmentExists) {
      return res.status(400).json({
        message: "Department already exists",
      });
    }

    const department =
      await Department.create({
        name,
        description,
      });

    res.status(201).json({
      success: true,
      department,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Get All Departments
const getDepartments = async (req, res) => {
  try {
    const departments =
      await Department.find().sort({
        createdAt: -1,
      });

    res.status(200).json({
      success: true,
      departments,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Delete Department
const deleteDepartment = async (req, res) => {
  try {
    await Department.findByIdAndDelete(
      req.params.id
    );

    res.status(200).json({
      success: true,
      message: "Department Deleted",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  createDepartment,
  getDepartments,
  deleteDepartment,
};