const express =
require("express");

const router =
express.Router();

const {

  getPendingStudents,

  approveStudent,

  rejectStudent,

  updateProfile,

} = require(
  "../controllers/userController"
);

const {
  protect,
} = require(
  "../middleware/authMiddleware"
);

const {
  changePassword,
} = require(
  "../controllers/userController"
);


// Pending Students

router.get(
  "/pending-students",
  protect,
  getPendingStudents
);



// Approve Student

router.put(
  "/approve/:id",
  protect,
  approveStudent
);



// Reject Student

router.delete(
  "/reject/:id",
  protect,
  rejectStudent
);



// Update Profile

router.put(
  "/update-profile",
  protect,
  updateProfile
);
router.put(
  "/change-password",
  protect,
  changePassword
);


module.exports =
router;