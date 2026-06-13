const Hostel = require("../../models/Hostel");

const User = require("../../models/User");

// ==========================================
// GET HOSTEL DETAILS
// ==========================================

const getHostelDetails = async (req, res) => {
  try {
    // ==========================================
    // FIND USER
    // ==========================================

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,

        message: "User not found",
      });
    }

    // ==========================================
    // FIND HOSTEL
    // ==========================================

    // ==========================================
    // FIND WARDEN

    const allWardens = await User.find({
      role: "WARDEN",
    });

    console.log("ALL WARDENS", allWardens);

    const warden = await User.findOne({
      role: "WARDEN",

      hostel: user.hostel,
    }).select("name phone hostel");

    console.log("FOUND WARDEN", warden);

    console.log("STUDENT HOSTEL", user.hostel);

    console.log(
      "STUDENT HOSTEL",

      user.hostel,
    );

    console.log("WARDEN HOSTEL", warden?.hostel);

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      hostel: { name: user.hostel },

      warden: { name: warden?.name || "N/A", phone: warden?.phone || "N/A" },

      student: {
        name: user.name,

        hostel: user.hostel,

        block: user.block,

        floor: user.floor,

        pocket: user.pocket,

        roomNumber: user.roomNumber,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// EXPORT
// ==========================================

module.exports = {
  getHostelDetails,
};
