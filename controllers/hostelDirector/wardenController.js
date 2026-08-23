const User = require("../../models/User");

// ==========================================
// ALLOWED HOSTELS
// ==========================================

const ALLOWED_HOSTELS = ["H1", "H2", "H3", "H4", "H5"];

// ==========================================
// NORMALIZE HOSTEL
// ==========================================

const normalizeHostel = (hostel) => {
  const hostelMap = {
    "Boys Hostel H1": "H1",
    "Girls Hostel H2": "H2",
    "Girls Hostel H3": "H3",
    "Boys Hostel H4": "H4",
    "Faculty Hostel H5": "H5",

    H1: "H1",
    H2: "H2",
    H3: "H3",
    H4: "H4",
    H5: "H5",
  };

  return hostelMap[hostel] || "";
};

// ==========================================
// CREATE WARDEN
// HOSTEL DIRECTOR ONLY
// ==========================================

const createWarden = async (req, res) => {
  try {
    const { name, email, password, phone, assignedHostel, employeeId } =
      req.body;

    // ======================================
    // REQUIRED FIELDS
    // ======================================

    if (!name || !email || !password || !assignedHostel) {
      return res.status(400).json({
        success: false,
        message: "Name, email, password and assigned hostel are required",
      });
    }

    // ======================================
    // NORMALIZE DATA
    // ======================================

    const normalizedEmail = email.trim().toLowerCase();

    const hostelCode = normalizeHostel(assignedHostel);

    if (!hostelCode || !ALLOWED_HOSTELS.includes(hostelCode)) {
      return res.status(400).json({
        success: false,
        message: "Invalid hostel selected",
      });
    }

    // ======================================
    // CHECK EXISTING USER
    // ======================================

    const userExists = await User.findOne({
      email: normalizedEmail,
    });

    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // ======================================
    // CHECK EMPLOYEE ID
    // ======================================

    if (employeeId) {
      const employeeExists = await User.findOne({
        employeeId: employeeId.trim(),
      });

      if (employeeExists) {
        return res.status(400).json({
          success: false,
          message: "Employee ID already exists",
        });
      }
    }

    // ======================================
    // ONE WARDEN PER HOSTEL
    // ======================================

    const hostelAssigned = await User.findOne({
      role: "WARDEN",
      assignedHostel: hostelCode,
      isActive: true,
    });

    if (hostelAssigned) {
      return res.status(400).json({
        success: false,
        message: `A Warden is already assigned to Hostel ${hostelCode}`,
      });
    }

    // ======================================
    // CREATE WARDEN
    // ======================================

    const warden = await User.create({
      name: name.trim(),

      email: normalizedEmail,

      password,

      phone: phone?.trim() || "",

      employeeId: employeeId?.trim() || "",

      assignedHostel: hostelCode,

      designation: "Hostel Warden",

      role: "WARDEN",

      status: "ACTIVE",

      isApproved: true,

      isActive: true,

      isVerified: true,
    });

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(201).json({
      success: true,

      message: `Warden created successfully for Hostel ${hostelCode}`,

      warden: {
        _id: warden._id,

        name: warden.name,

        email: warden.email,

        phone: warden.phone,

        employeeId: warden.employeeId,

        role: warden.role,

        designation: warden.designation,

        assignedHostel: warden.assignedHostel,

        status: warden.status,

        isActive: warden.isActive,
      },
    });
  } catch (error) {
    console.log("CREATE WARDEN ERROR:", error);

    return res.status(500).json({
      success: false,

      message: error.message || "Failed to create Warden",
    });
  }
};

// ==========================================
// GET ALL WARDENS
// HOSTEL DIRECTOR
// ==========================================

const getAllWardens = async (req, res) => {
  try {
    const wardens = await User.find({
      role: "WARDEN",
    })
      .select("-password -resetPasswordToken -emailOTP")
      .sort({
        assignedHostel: 1,
        name: 1,
      });

    // ======================================
    // ADD HOSTEL STUDENT COUNT
    // ======================================

    const updatedWardens = await Promise.all(
      wardens.map(async (warden) => {
        const students = await User.countDocuments({
          role: "STUDENT",

          isHosteller: true,

          hostel: warden.assignedHostel,

          studentStatus: {
            $ne: "LEFT_HOSTEL",
          },
        });

        const pendingStudents = await User.countDocuments({
          role: "STUDENT",

          isHosteller: true,

          hostel: warden.assignedHostel,

          studentStatus: "PENDING",
        });

        return {
          ...warden.toObject(),

          students,

          pendingStudents,
        };
      }),
    );

    return res.status(200).json({
      success: true,

      totalWardens: updatedWardens.length,

      wardens: updatedWardens,
    });
  } catch (error) {
    console.log("GET WARDENS ERROR:", error);

    return res.status(500).json({
      success: false,

      message: error.message || "Failed to fetch Wardens",
    });
  }
};

// ==========================================
// GET SINGLE WARDEN
// ==========================================

const getWardenById = async (req, res) => {
  try {
    const warden = await User.findOne({
      _id: req.params.id,
      role: "WARDEN",
    }).select("-password");

    if (!warden) {
      return res.status(404).json({
        success: false,
        message: "Warden not found",
      });
    }

    // ======================================
    // HOSTEL STUDENTS
    // ======================================

    const students = await User.find({
      role: "STUDENT",

      isHosteller: true,

      hostel: warden.assignedHostel,

      studentStatus: {
        $ne: "LEFT_HOSTEL",
      },
    })
      .select(
        "name email phone hostel block roomNumber floor studentStatus isApproved assignedWarden",
      )
      .sort({
        roomNumber: 1,
      });

    return res.status(200).json({
      success: true,

      warden,

      hostel: warden.assignedHostel,

      totalStudents: students.length,

      students,
    });
  } catch (error) {
    console.log("GET WARDEN ERROR:", error);

    return res.status(500).json({
      success: false,

      message: error.message || "Failed to fetch Warden",
    });
  }
};

// ==========================================
// UPDATE WARDEN
// ==========================================

const updateWarden = async (req, res) => {
  try {
    const { name, phone, assignedHostel, status, employeeId, isActive } =
      req.body;

    const warden = await User.findById(req.params.id);

    if (!warden) {
      return res.status(404).json({
        success: false,
        message: "Warden not found",
      });
    }

    if (warden.role !== "WARDEN") {
      return res.status(400).json({
        success: false,
        message: "Selected user is not a Warden",
      });
    }

    // ======================================
    // HOSTEL CHANGE
    // ======================================

    if (assignedHostel) {
      const hostelCode = normalizeHostel(assignedHostel);

      if (!hostelCode) {
        return res.status(400).json({
          success: false,
          message: "Invalid hostel selected",
        });
      }

      if (hostelCode !== warden.assignedHostel) {
        // ==================================
        // CHECK ANOTHER WARDEN
        // ==================================

        const hostelExists = await User.findOne({
          role: "WARDEN",

          assignedHostel: hostelCode,

          isActive: true,

          _id: {
            $ne: warden._id,
          },
        });

        if (hostelExists) {
          return res.status(400).json({
            success: false,
            message: "Another Warden is already assigned to this hostel",
          });
        }

        // ==================================
        // REMOVE OLD STUDENT-WARDEN LINKS
        // Approval itself is NOT changed.
        // ==================================

        await User.updateMany(
          {
            role: "STUDENT",

            assignedWarden: warden._id,
          },
          {
            $set: {
              assignedWarden: null,
            },
          },
        );

        warden.assignedHostel = hostelCode;
      }
    }

    // ======================================
    // EMPLOYEE ID CHECK
    // ======================================

    if (employeeId && employeeId !== warden.employeeId) {
      const employeeExists = await User.findOne({
        employeeId: employeeId.trim(),

        _id: {
          $ne: warden._id,
        },
      });

      if (employeeExists) {
        return res.status(400).json({
          success: false,
          message: "Employee ID already exists",
        });
      }

      warden.employeeId = employeeId.trim();
    }

    // ======================================
    // BASIC UPDATE
    // ======================================

    if (name) {
      warden.name = name.trim();
    }

    if (phone !== undefined) {
      warden.phone = phone.trim();
    }

    if (status) {
      warden.status = status;
    }

    if (typeof isActive === "boolean") {
      warden.isActive = isActive;
    }

    // ======================================
    // SAVE
    // ======================================

    await warden.save();

    const safeWarden = await User.findById(warden._id).select("-password");

    return res.status(200).json({
      success: true,

      message: "Warden updated successfully",

      warden: safeWarden,
    });
  } catch (error) {
    console.log("UPDATE WARDEN ERROR:", error);

    return res.status(500).json({
      success: false,

      message: error.message || "Failed to update Warden",
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

    if (warden.role !== "WARDEN") {
      return res.status(400).json({
        success: false,
        message: "Selected user is not a Warden",
      });
    }

    // ======================================
    // REMOVE WARDEN REFERENCE FROM STUDENTS
    // ======================================

    await User.updateMany(
      {
        role: "STUDENT",

        assignedWarden: warden._id,
      },
      {
        $set: {
          assignedWarden: null,
        },
      },
    );

    // ======================================
    // DELETE WARDEN
    // ======================================

    await User.findByIdAndDelete(warden._id);

    return res.status(200).json({
      success: true,

      message: "Warden removed successfully",
    });
  } catch (error) {
    console.log("DELETE WARDEN ERROR:", error);

    return res.status(500).json({
      success: false,

      message: error.message || "Failed to remove Warden",
    });
  }
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  createWarden,

  getAllWardens,

  getWardenById,

  updateWarden,

  deleteWarden,
};
