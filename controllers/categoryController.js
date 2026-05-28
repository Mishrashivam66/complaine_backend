const Category = require("../models/Category");

// Create Category
const createCategory = async (req, res) => {
  try {
    const { name, department } = req.body;

    const categoryExists =
      await Category.findOne({ name });

    if (categoryExists) {
      return res.status(400).json({
        message: "Category already exists",
      });
    }

    const category =
      await Category.create({
        name,
        department,
      });

    res.status(201).json({
      success: true,
      category,
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Get Categories
const getCategories = async (req, res) => {
  try {

    const categories =
      await Category.find()
      .populate("department")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      categories,
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Delete Category
const deleteCategory = async (req, res) => {
  try {

    await Category.findByIdAndDelete(
      req.params.id
    );

    res.status(200).json({
      success: true,
      message: "Category Deleted",
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  createCategory,
  getCategories,
  deleteCategory,
};