const Building = require("../../models/Building");

// ==========================================
// CREATE BUILDING
// ==========================================

const createBuilding = async (req, res) => {
  try {
    const {
      buildingName,

      buildingType,

      startFloor,

      endFloor,

      roomRange,
    } = req.body;

    // ==========================================
    // CHECK EXISTING
    // ==========================================

    const existingBuilding = await Building.findOne({
      buildingName,
    });

    if (existingBuilding) {
      return res.status(400).json({
        success: false,

        message: "Building already exists",
      });
    }

    // ==========================================
    // CREATE
    // ==========================================

    const building = await Building.create({
      buildingName,

      buildingType,

      startFloor,

      endFloor,

      roomRange,
    });

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(201).json({
      success: true,

      message: "Building created successfully",

      building,
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
// GET BUILDINGS
// ==========================================

const getBuildings = async (req, res) => {
  try {
    const buildings = await Building.find().sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,

      buildings,
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
// UPDATE BUILDING
// ==========================================

const updateBuilding = async (req, res) => {
  try {
    const building = await Building.findById(req.params.id);

    if (!building) {
      return res.status(404).json({
        success: false,

        message: "Building not found",
      });
    }

    const updatedBuilding = await Building.findByIdAndUpdate(
      req.params.id,

      req.body,

      {
        new: true,
      },
    );

    res.status(200).json({
      success: true,

      message: "Building updated successfully",

      building: updatedBuilding,
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
// DELETE BUILDING
// ==========================================

const deleteBuilding = async (req, res) => {
  try {
    const building = await Building.findById(req.params.id);

    if (!building) {
      return res.status(404).json({
        success: false,

        message: "Building not found",
      });
    }

    await Building.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,

      message: "Building deleted successfully",
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
  createBuilding,

  getBuildings,

  updateBuilding,

  deleteBuilding,
};
