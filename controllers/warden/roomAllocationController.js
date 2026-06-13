const Room = require("../../models/Room");

const User = require("../../models/User");

// ==========================================
// GET ALL ROOMS
// ==========================================

const getRooms = async (req, res) => {
  try {
    const rooms = await Room.find().populate(
      "students",
      "name email roomNumber",
    );

    res.status(200).json({
      success: true,

      rooms,
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// GET UNALLOCATED STUDENTS
// ==========================================

const getUnallocatedStudents = async (req, res) => {
  try {
    const students = await User.find({
      role: "STUDENT",
      isApproved: true,
    }).select("-password");

    res.status(200).json({
      success: true,

      students,
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// ASSIGN ROOM
// ==========================================

const assignRoom = async (req, res) => {
  try {
    const {
      studentId,

      roomId,
    } = req.body;

    // ==========================================
    // FIND ROOM & STUDENT
    // ==========================================

    const room = await Room.findById(roomId);

    const student = await User.findById(studentId);

    // ==========================================
    // VALIDATION
    // ==========================================

    if (!room || !student) {
      return res.status(404).json({
        success: false,

        message: "Room or Student not found",
      });
    }

    // ==========================================
    // ROOM FULL
    // ==========================================

    if (room.occupied >= room.capacity) {
      return res.status(400).json({
        success: false,

        message: "Room is Full",
      });
    }

    // ==========================================
    // ALREADY ASSIGNED
    // ==========================================

    if (room.students.includes(student._id)) {
      return res.status(400).json({
        success: false,

        message: "Student already assigned",
      });
    }

    // ==========================================
    // UPDATE ROOM
    // ==========================================

    room.students.push(student._id);

    room.occupied += 1;

    await room.save();

    // ==========================================
    // UPDATE STUDENT
    // ==========================================

    student.hostel = room.hostel;

    student.block = room.block;

    student.floor = room.floor;

    student.pocket = room.pocket;

    student.roomNumber = room.roomNumber;

    student.isHosteller = true;

    await student.save();

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      message: "Room allocated successfully",

      room,

      student,
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// REMOVE ROOM
// ==========================================

const removeRoom = async (req, res) => {
  try {
    const {
      studentId,

      roomId,
    } = req.body;

    // ==========================================
    // FIND ROOM & STUDENT
    // ==========================================

    const room = await Room.findById(roomId);

    const student = await User.findById(studentId);

    // ==========================================
    // VALIDATION
    // ==========================================

    if (!room || !student) {
      return res.status(404).json({
        success: false,

        message: "Room or Student not found",
      });
    }

    // ==========================================
    // REMOVE STUDENT
    // ==========================================

    room.students = room.students.filter((id) => id.toString() !== studentId);

    room.occupied -= 1;

    await room.save();

    // ==========================================
    // REMOVE HOSTEL DETAILS
    // ==========================================

    student.hostel = "";

    student.block = "";

    student.floor = "";

    student.pocket = "";

    student.roomNumber = "";

    student.isHosteller = false;

    await student.save();

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      message: "Room removed successfully",

      room,

      student,
    });
  } catch (error) {
    res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// CREATE ROOM
// ==========================================

const createRoom = async (req, res) => {
  try {
    const {
      hostel,

      block,

      floor,

      pocket,

      roomNumber,

      capacity,
    } = req.body;

    // CHECK EXISTING ROOM

    const existingRoom = await Room.findOne({
      roomNumber,
    });

    if (existingRoom) {
      return res.status(400).json({
        success: false,

        message: "Room already exists",
      });
    }

    // CREATE ROOM

    const room = await Room.create({
      hostel,

      block,

      floor,

      pocket,

      roomNumber,

      capacity,
    });

    res.status(201).json({
      success: true,

      message: "Room created successfully",

      room,
    });
  } catch (error) {
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
  getRooms,

  getUnallocatedStudents,

  assignRoom,

  removeRoom,
  createRoom,
};
