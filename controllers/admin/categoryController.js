const Category = require("../../models/Category");

// ==========================================
// CREATE CATEGORY
// ==========================================

const createCategory = async (req, res) => {
  try {
    const {
      categoryName,

      department,

      priority,

      icon,

      description,

      subCategories,
    } = req.body;

    // ==========================================
    // CHECK EXISTING
    // ==========================================

    const existingCategory = await Category.findOne({
      categoryName,
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,

        message: "Category already exists",
      });
    }

    // ==========================================
    // CREATE
    // ==========================================

    const category = await Category.create({
      categoryName,

      department,

      priority,

      icon,

      description,

      subCategories,
    });

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(201).json({
      success: true,

      message: "Category created successfully",

      category,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// GET CATEGORIES
// ==========================================

const getCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,

      total: categories.length,

      categories,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// UPDATE CATEGORY
// ==========================================

const updateCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,

        message: "Category not found",
      });
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      req.params.id,

      req.body,

      {
        new: true,
      },
    );

    res.status(200).json({
      success: true,

      message: "Category updated successfully",

      category: updatedCategory,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// DELETE CATEGORY
// ==========================================

const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,

        message: "Category not found",
      });
    }

    await Category.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,

      message: "Category deleted successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// TOGGLE STATUS
// ==========================================

const toggleCategoryStatus = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,

        message: "Category not found",
      });
    }

    category.isActive = !category.isActive;

    await category.save();

    res.status(200).json({
      success: true,

      message: category.isActive
        ? "Category activated"
        : "Category deactivated",

      category,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  createCategory,

  getCategories,

  updateCategory,

  deleteCategory,

  toggleCategoryStatus,
};
