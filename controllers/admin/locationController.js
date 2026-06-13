const Location = require("../../models/Location");

// ==========================================
// CREATE LOCATION
// ==========================================

console.log("LOCATION CONTROLLER LOADED");

const createLocation = async (req, res) => {
  try {
    const {
      buildingName,

      locationType,

      block,

      floor,

      roomNumber,

      capacity,

      blocks,

      floors,
    } = req.body;

    // ==========================================
    // CHECK EXISTING ROOM
    // ==========================================

    const existingRoom = await Location.findOne({
      buildingName,

      block,

      floor,

      roomNumber,
    });

    if (existingRoom) {
      return res.status(400).json({
        success: false,

        message: "Room already exists",
      });
    }

    // ==========================================
    // CREATE LOCATION
    // ==========================================

    const location = await Location.create({
      buildingName,

      locationType,

      block,

      floor,

      roomNumber,

      capacity,

      blocks,

      floors,
    });

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(201).json({
      success: true,

      message: "Infrastructure created successfully",

      location,
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
// GET ALL LOCATIONS
// ==========================================

const getLocations = async (req, res) => {
  console.log("GET LOCATIONS HIT");

  try {
    const locations = await Location.find().sort({
      createdAt: -1,
    });

    // ==========================================
    // STATS
    // ==========================================

    const totalRooms = locations.length;

    const occupiedRooms = locations.filter((room) => room.isOccupied).length;

    const availableRooms = totalRooms - occupiedRooms;

    // ==========================================
    // LOCATION TYPE ANALYTICS
    // ==========================================

    const locationAnalytics = [
      "HOSTEL",

      "SPORTS_COMPLEX",

      "ACADEMIC_BLOCK",

      "LIBRARY",

      "LAB",

      "CAFETERIA",

      "AUDITORIUM",
    ].map((type) => {
      const typeLocations = locations.filter(
        (location) => location.locationType === type,
      );

      return {
        locationType: type,

        totalBuildings: typeLocations.length,

        occupiedRooms: typeLocations.filter((room) => room.isOccupied).length,
      };
    });

    // ==========================================
    // BUILDING ANALYTICS
    // ==========================================

    const uniqueBuildings = [
      ...new Set(locations.map((location) => location.buildingName)),
    ];

    const buildingAnalytics = uniqueBuildings.map((building) => {
      const buildingRooms = locations.filter(
        (room) => room.buildingName === building,
      );

      return {
        buildingName: building,

        totalRooms: buildingRooms.length,

        occupiedRooms: buildingRooms.filter((room) => room.isOccupied).length,

        availableRooms: buildingRooms.filter((room) => !room.isOccupied).length,
      };
    });

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      locations,

      stats: {
        totalRooms,

        occupiedRooms,

        availableRooms,
      },

      locationAnalytics,

      buildingAnalytics,
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
// UPDATE LOCATION
// ==========================================

const updateLocation = async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);

    if (!location) {
      return res.status(404).json({
        success: false,

        message: "Infrastructure not found",
      });
    }

    const {
      buildingName,

      locationType,

      block,

      floor,

      roomNumber,

      capacity,

      blocks,

      floors,
    } = req.body;

    // ==========================================
    // UPDATE
    // ==========================================

    location.buildingName = buildingName || location.buildingName;

    location.locationType = locationType || location.locationType;

    location.block = block || location.block;

    location.floor = floor || location.floor;

    location.roomNumber = roomNumber || location.roomNumber;

    location.capacity = capacity || location.capacity;

    location.blocks = blocks || location.blocks;

    location.floors = floors || location.floors;

    await location.save();

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      message: "Infrastructure updated successfully",

      location,
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
// DELETE LOCATION
// ==========================================

const deleteLocation = async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);

    if (!location) {
      return res.status(404).json({
        success: false,

        message: "Infrastructure not found",
      });
    }

    await Location.findByIdAndDelete(req.params.id);

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      message: "Infrastructure deleted successfully",
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
  createLocation,

  getLocations,

  updateLocation,

  deleteLocation,
};
