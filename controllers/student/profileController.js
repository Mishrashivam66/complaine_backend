const User = require("../../models/User");

// ==========================================
// UPDATE STUDENT PROFILE
// ==========================================

const updateStudentProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.role !== "STUDENT") {
      return res.status(403).json({
        success: false,
        message: "Only students can update student profiles",
      });
    }

    const wasLocked = user.profileEditLocked;

    // ==========================================
    // PERSONAL + ACADEMIC - ONE TIME EDIT
    // ==========================================

    if (!wasLocked) {
      const updateFields = [
        "name",
        "phone",
        "parentPhone",
        "emergencyContact",
        "amizoneId",
        "course",
        "year",
        "section",
        "department",
      ];

      for (const field of updateFields) {
        if (req.body[field] !== undefined) {
          user[field] =
            typeof req.body[field] === "string"
              ? req.body[field].trim()
              : req.body[field];
        }
      }

      // Department is necessary before locking.
      if (!String(user.department || "").trim()) {
        return res.status(400).json({
          success: false,
          message: "Please select your department before saving your profile.",
        });
      }

      // Academic department block is optional here.
      // It must be assigned from a trusted source,
      // not silently copied from hostel block.

      user.profileEditLocked = true;
    }

    // ==========================================
    // SEMESTER ALWAYS EDITABLE
    // ==========================================

    if (req.body.semester !== undefined) {
      user.semester = String(req.body.semester).trim();
    }

    await user.save();

    const safeUser = user.toObject();

    delete safeUser.password;
    delete safeUser.emailOTP;
    delete safeUser.verificationToken;
    delete safeUser.resetPasswordToken;
    delete safeUser.resetPasswordExpires;
    delete safeUser.emailOTPExpire;
    delete safeUser.verificationTokenExpire;

    return res.status(200).json({
      success: true,
      message: wasLocked
        ? "Semester updated successfully"
        : "Profile updated successfully",
      user: safeUser,
    });
  } catch (error) {
    console.error("UPDATE STUDENT PROFILE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update profile",
    });
  }
};

module.exports = {
  updateStudentProfile,
};
