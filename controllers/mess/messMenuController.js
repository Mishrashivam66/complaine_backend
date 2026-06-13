const MessMenu = require("../../models/MessMenu");

const XLSX = require("xlsx");

const fs = require("fs");

// ==========================================
// CREATE MENU
// ==========================================

const createMenu = async (req, res) => {
  try {
    const menu = await MessMenu.create(req.body);

    res.status(201).json({
      success: true,

      message: "Menu created successfully",

      menu,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to create menu",
    });
  }
};

// ==========================================
// GET ALL MENU
// ==========================================

const getMenus = async (req, res) => {
  try {
    const menus = await MessMenu.find().sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,

      menus,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to fetch menus",
    });
  }
};

// ==========================================
// DELETE MENU
// ==========================================

const deleteMenu = async (req, res) => {
  try {
    const menu = await MessMenu.findById(req.params.id);

    if (!menu) {
      return res.status(404).json({
        success: false,

        message: "Menu not found",
      });
    }

    await menu.deleteOne();

    res.status(200).json({
      success: true,

      message: "Menu deleted successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to delete menu",
    });
  }
};

// ==========================================
// UPLOAD EXCEL MENU
// ==========================================

const uploadMenuExcel = async (req, res) => {
  try {
    // ==========================================
    // FILE CHECK
    // ==========================================

    if (!req.file) {
      return res.status(400).json({
        success: false,

        message: "Excel file required",
      });
    }

    // ==========================================
    // READ EXCEL
    // ==========================================

    const workbook = XLSX.readFile(req.file.path);

    const sheetName = workbook.SheetNames[0];

    const worksheet = workbook.Sheets[sheetName];

    const data = XLSX.utils.sheet_to_json(worksheet);

    // ==========================================
    // FORMAT DATA
    // ==========================================

    const formattedMenus = data.map((item) => ({
      date: item.date || item.Date,

      breakfast: item.breakfast || item.Breakfast,

      lunch: item.lunch || item.Lunch,

      snacks: item.snacks || item.Snacks,

      dinner: item.dinner || item.Dinner,
    }));

    // ==========================================
    // SAVE TO DATABASE
    // ==========================================

    await MessMenu.insertMany(formattedMenus);

    // ==========================================
    // DELETE FILE AFTER UPLOAD
    // ==========================================

    fs.unlinkSync(req.file.path);

    res.status(200).json({
      success: true,

      message: "Monthly menu uploaded successfully",

      totalMenus: formattedMenus.length,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,

      message: "Failed to upload excel menu",
    });
  }
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  createMenu,

  getMenus,

  deleteMenu,

  uploadMenuExcel,
};
