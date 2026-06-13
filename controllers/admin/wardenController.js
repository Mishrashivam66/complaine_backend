const User = require("../../models/User");

// ==========================================
// CREATE WARDEN
// ==========================================

const createWarden = async (req, res) => {
  try {
    const {
      name,

      email,

      password,

      phone,

      assignedHostel,

      employeeId,
    } = req.body;

    // ==========================================
    // VALIDATION
    // ==========================================

    if (!name || !email || !password || !assignedHostel) {
      return res.status(400).json({
        success: false,

        message: "Please fill all required fields",
      });
    }

    // ==========================================
    // CHECK EXISTING USER
    // ==========================================

    const userExists = await User.findOne({
      email,
    });

    if (userExists) {
      return res.status(400).json({
        success: false,

        message: "Warden already exists",
      });
    }

    // ==========================================
    // CHECK HOSTEL ASSIGNED
    // ==========================================

    const hostelAssigned = await User.findOne({
      role: "WARDEN",

      assignedHostel,
    });

    if (hostelAssigned) {
      return res.status(400).json({
        success: false,

        message: "Warden already assigned to this hostel",
      });
    }

    // ==========================================
    // CREATE WARDEN
    // ==========================================

    const warden = await User.create({
      name,

      email,

      password,

      phone,

      assignedHostel,

      employeeId,

      role: "WARDEN",

      status: "ACTIVE",

      isApproved: true,
    });

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(201).json({
      success: true,

      message: "Warden created successfully",

      warden: {
        _id: warden._id,

        name: warden.name,

        email: warden.email,

        role: warden.role,

        phone: warden.phone,

        employeeId: warden.employeeId,

        assignedHostel: warden.assignedHostel,

        status: warden.status,
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
// GET ALL WARDENS
// ==========================================

const getAllWardens = async (req, res) => {
  try {
    const wardens = await User.find({
      role: "WARDEN",
    }).select("-password");

    // ==========================================
    // ADD STUDENT COUNT
    // ==========================================

    const updatedWardens = await Promise.all(
      wardens.map(async (warden) => {
        const students = await User.countDocuments({
          role: "STUDENT",

          hostel: warden.assignedHostel,

          isHosteller: true,

          studentStatus: {
            $ne: "LEFT_HOSTEL",
          },
        });

        return {
          ...warden._doc,

          students,
        };
      }),
    );

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      totalWardens: updatedWardens.length,

      wardens: updatedWardens,
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
// DELETE WARDEN
// ==========================================

const deleteWarden = async (req, res) => {
  try {
    const warden = await User.findById(req.params.id);

    if (!warden) {
      return res.status(404).json({
        success: false,

        message: "Warden not found",
      });
    }

    // ==========================================
    // CHECK ROLE
    // ==========================================

    if (warden.role !== "WARDEN") {
      return res.status(400).json({
        success: false,

        message: "User is not a warden",
      });
    }

    // ==========================================
    // DELETE
    // ==========================================

    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,

      message: "Warden removed successfully",
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
// UPDATE WARDEN
// ==========================================

const updateWarden = async (req, res) => {
  try {
    const {
      name,

      phone,

      assignedHostel,

      status,
    } = req.body;

    const warden = await User.findById(req.params.id);

    if (!warden) {
      return res.status(404).json({
        success: false,

        message: "Warden not found",
      });
    }

    // ==========================================
    // HOSTEL CHECK
    // ==========================================

    if (assignedHostel && assignedHostel !== warden.assignedHostel) {
      const hostelExists = await User.findOne({
        role: "WARDEN",

        assignedHostel,

        _id: {
          $ne: req.params.id,
        },
      });

      if (hostelExists) {
        return res.status(400).json({
          success: false,

          message: "Hostel already assigned",
        });
      }
    }

    // ==========================================
    // UPDATE
    // ==========================================

    warden.name = name || warden.name;

    warden.phone = phone || warden.phone;

    warden.assignedHostel = assignedHostel || warden.assignedHostel;

    warden.status = status || warden.status;

    await warden.save();

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      message: "Warden updated successfully",

      warden,
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
  createWarden,

  getAllWardens,

  deleteWarden,

  updateWarden,
};
