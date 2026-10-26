"use strict";

const User = require("../../models/User");

const VALID_SHIFTS = ["DAY", "NIGHT", "24x7"];

const createWorker = async (req, res) => {
  try {
    // Only Maintenance Manager can create Technicians
    if (req.user?.role !== "MAINTENANCE_MANAGER") {
      return res.status(403).json({
        success: false,
        message: "Only a Maintenance Manager can create Technician accounts.",
      });
    }

    const { name, email, phone, password, category, shift = "DAY" } = req.body;

    const cleanName = String(name || "").trim();

    const cleanEmail = String(email || "")
      .trim()
      .toLowerCase();

    const cleanPhone = String(phone || "").trim();

    const cleanCategory = String(category || "")
      .trim()
      .toUpperCase();

    // Input validation
    if (
      !cleanName ||
      !cleanEmail ||
      !cleanPhone ||
      !cleanCategory ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided.",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address.",
      });
    }

    if (!/^\+?\d{10,15}$/.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid mobile number.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters.",
      });
    }

    if (!VALID_SHIFTS.includes(shift)) {
      return res.status(400).json({
        success: false,
        message: "Invalid duty shift.",
      });
    }

    // Prevent duplicate email accounts
    const existingUser = await User.findOne({
      email: cleanEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    // Creates ONE User record.
    // User schema automatically hashes password.
    const technician = await User.create({
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      password,

      role: "TECHNICIAN",
      department: cleanCategory,

      shift,
      status: "ACTIVE",

      currentJobs: 0,
      maxJobs: 10,

      isActive: true,
      isDeleted: false,
      isApproved: true,
    });

    return res.status(201).json({
      success: true,
      accountCreated: true,
      message: "Technician account created successfully.",

      worker: {
        _id: technician._id,
        name: technician.name,
        email: technician.email,
        phone: technician.phone,
        role: technician.role,
        department: technician.department,
        shift: technician.shift,
        status: technician.status,
        currentJobs: technician.currentJobs,
        maxJobs: technician.maxJobs,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Email already exists.",
      });
    }

    console.error("Technician creation error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create Technician account.",
    });
  }
};

module.exports = {
  createWorker,
};
