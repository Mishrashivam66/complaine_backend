const Hostel = require("../../models/Hostel");

// ==========================================
// CREATE HOSTEL
// ==========================================

const createHostel = async (req, res) => {
  try {
    const {
      hostelName,

      hostelType,

      totalFloors,

      totalRooms,

      totalCapacity,
    } = req.body;

    // ==========================================
    // CHECK EXISTING HOSTEL
    // ==========================================

    const existingHostel = await Hostel.findOne({
      hostelName,
    });

    if (existingHostel) {
      return res.status(400).json({
        success: false,

        message: "Hostel already exists",
      });
    }

    // ==========================================
    // CREATE HOSTEL
    // ==========================================

    const hostel = await Hostel.create({
      hostelName,

      hostelType,

      totalFloors,

      totalRooms,

      totalCapacity,
    });

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(201).json({
      success: true,

      message: "Hostel created successfully",

      hostel,
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
// GET ALL HOSTELS
// ==========================================

const getAllHostels = async (req, res) => {
  try {
    const hostels = await Hostel.find().sort({
      createdAt: -1,
    });

    // ==========================================
    // ANALYTICS
    // ==========================================

    const totalHostels = hostels.length;

    const totalCapacity = hostels.reduce(
      (acc, hostel) => acc + hostel.totalCapacity,

      0,
    );

    const occupiedBeds = hostels.reduce(
      (acc, hostel) => acc + hostel.occupiedBeds,

      0,
    );

    const availableBeds = totalCapacity - occupiedBeds;

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      hostels,

      analytics: {
        totalHostels,

        totalCapacity,

        occupiedBeds,

        availableBeds,
      },
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
// UPDATE HOSTEL
// ==========================================

const updateHostel = async (req, res) => {
  try {
    const hostel = await Hostel.findById(req.params.id);

    if (!hostel) {
      return res.status(404).json({
        success: false,

        message: "Hostel not found",
      });
    }

    const updatedHostel = await Hostel.findByIdAndUpdate(
      req.params.id,

      req.body,

      {
        new: true,
      },
    );

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      message: "Hostel updated successfully",

      hostel: updatedHostel,
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
// DELETE HOSTEL
// ==========================================

const deleteHostel = async (req, res) => {
  try {
    const hostel = await Hostel.findById(req.params.id);

    if (!hostel) {
      return res.status(404).json({
        success: false,

        message: "Hostel not found",
      });
    }

    await Hostel.findByIdAndDelete(req.params.id);

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      message: "Hostel deleted successfully",
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
  createHostel,

  getAllHostels,

  updateHostel,

  deleteHostel,
};
