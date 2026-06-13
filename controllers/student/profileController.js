const User = require("../../models/User");

// ==========================================
// UPDATE STUDENT PROFILE
// ==========================================

const updateStudentProfile = async (req, res) => {
  try {
    // ==========================================
    // FIND USER
    // ==========================================

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,

        message: "User not found",
      });
    }

    // ==========================================
    // PERSONAL + ACADEMIC
    // ONLY ONE TIME EDIT
    // ==========================================

    if (!user.profileEditLocked) {
      // ==========================================
      // PERSONAL INFO
      // ==========================================

      user.name = req.body.name || user.name;

      user.phone = req.body.phone || user.phone;

      user.parentPhone = req.body.parentPhone || user.parentPhone;

      user.emergencyContact =
        req.body.emergencyContact || user.emergencyContact;

      // ==========================================
      // ACADEMIC INFO
      // ==========================================

      user.amizoneId = req.body.amizoneId || user.amizoneId;

      user.course = req.body.course || user.course;

      user.year = req.body.year || user.year;

      user.section = req.body.section || user.section;

      user.department = req.body.department || user.department;

      // ==========================================
      // LOCK PROFILE
      // ==========================================

      user.profileEditLocked = true;
    }

    // ==========================================
    // SEMESTER ALWAYS EDITABLE
    // ==========================================

    user.semester = req.body.semester || user.semester;

    // ==========================================
    // SAVE USER
    // ==========================================

    await user.save();

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      message: user.profileEditLocked
        ? "Profile updated successfully"
        : "Semester updated successfully",

      user,
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
// EXPORT
// ==========================================

module.exports = {
  updateStudentProfile,
};
