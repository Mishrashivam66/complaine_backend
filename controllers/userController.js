const User = require("../models/User");


// Pending Students
const getPendingStudents =
async (req, res) => {

  try {

    const students =
      await User.find({

        role: "STUDENT",

        isHosteller: true,

        isApproved: false

      });

    res.status(200).json({

      success: true,

      students

    });

  } catch (error) {

    res.status(500).json({
      message: error.message
    });

  }

};


// Approve Student
const approveStudent =
async (req, res) => {

  try {

    const student =
      await User.findByIdAndUpdate(

        req.params.id,

        {
          isApproved: true,
          approvedAt: new Date()
        },

        {
          new: true
        }

      );

    res.status(200).json({

      success: true,

      message:
        "Student Approved",

      student

    });

  } catch (error) {

    res.status(500).json({
      message: error.message
    });

  }

};


// Reject Student
const rejectStudent =
async (req, res) => {

  try {

    await User.findByIdAndDelete(
      req.params.id
    );

    res.status(200).json({

      success: true,

      message:
        "Student Rejected"

    });

  } catch (error) {

    res.status(500).json({
      message: error.message
    });

  }

};

const updateProfile =
async (req, res) => {

  try {

    const user =
      await User.findById(
        req.user.id
      );

    if (!user) {

      return res.status(404).json({
        message: "User not found",
      });

    }

    user.phone =
      req.body.phone ||
      user.phone;

    user.parentPhone =
      req.body.parentPhone ||
      user.parentPhone;

    user.emergencyContact =
      req.body.emergencyContact ||
      user.emergencyContact;

    await user.save();

    res.status(200).json({
      success: true,
      user,
    });

  } catch (error) {

    res.status(500).json({
      message: error.message,
    });

  }

};
const bcrypt =
require("bcryptjs");



const changePassword =
async (req, res) => {

  try {

    const {

      currentPassword,

      newPassword,

    } = req.body;

    const user =
    await User.findById(
      req.user.id
    );

    if (!user) {

      return res.status(404).json({

        message:
          "User not found",

      });

    }

    // Check Current Password

    const isMatch =

    await bcrypt.compare(

      currentPassword,

      user.password

    );

    if (!isMatch) {

      return res.status(400).json({

        message:
          "Current password is incorrect",

      });

    }

    // Hash New Password

    const salt =
    await bcrypt.genSalt(10);

    user.password =

    await bcrypt.hash(

      newPassword,

      salt

    );

    await user.save();

    res.status(200).json({

      success: true,

      message:
        "Password updated successfully",

    });

  } catch (error) {

    res.status(500).json({

      message:
        error.message,

    });

  }

};



module.exports = {

  getPendingStudents,

  approveStudent,

  rejectStudent,
  updateProfile,
   changePassword

};