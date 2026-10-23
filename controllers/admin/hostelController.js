"use strict";

const mongoose = require("mongoose");

const Hostel = require("../../models/Hostel");
const User = require("../../models/User");
const Complaint = require("../../models/Complaint");

const TYPES = new Set(["BOYS", "GIRLS", "CO-ED", "STAFF"]);

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,11}$/;

// ==========================================
// LEGACY HOSTEL CODE COMPATIBILITY
// ==========================================

const legacyCode = (name) => {
  const match = String(name || "").match(/\b(H\d+[A-Z]?)\b/i);

  return match ? match[1].toUpperCase() : "";
};

const codeOf = (hostel) =>
  String(hostel.hostelCode || "")
    .trim()
    .toUpperCase() || legacyCode(hostel.hostelName);

const present = (hostel) => ({
  ...hostel,
  hostelCode: codeOf(hostel),
});

// ==========================================
// ALL RECOGNIZED HOSTEL REFERENCES
// ==========================================

const aliasesFor = (hostel) => {
  const code = codeOf(hostel);

  return [
    ...new Set(
      [
        hostel.hostelName,
        code,
        `Hostel ${code}`,
        `Boys Hostel ${code}`,
        `Girls Hostel ${code}`,
        `Faculty Hostel ${code}`,
      ].filter(Boolean),
    ),
  ];
};

// ==========================================
// CHECK EXISTING ASSIGNMENTS
// ==========================================

async function dependencyMessage(hostel) {
  const aliases = aliasesFor(hostel);

  const warden = await User.exists({
    role: "WARDEN",
    assignedHostel: {
      $in: aliases,
    },
    isActive: true,
    isDeleted: {
      $ne: true,
    },
  });

  if (warden) {
    return "Reassign the active Warden before disabling this hostel";
  }

  const student = await User.exists({
    role: "STUDENT",
    isHosteller: true,
    hostel: {
      $in: aliases,
    },
    isDeleted: {
      $ne: true,
    },
    studentStatus: {
      $ne: "LEFT_HOSTEL",
    },
  });

  if (student) {
    return "Move current hostel residents before disabling this hostel";
  }

  const complaint = await Complaint.exists({
    complaintArea: "HOSTEL",
    hostel: {
      $in: aliases,
    },
    status: {
      $nin: ["COMPLETED", "RESOLVED", "CLOSED"],
    },
  });

  if (complaint) {
    return "Resolve or reassign open hostel complaints first";
  }

  return null;
}

// ==========================================
// VALIDATE INPUT FIELDS
// ==========================================

function inputFields(body, { creating = false } = {}) {
  const output = {};

  if (creating || body.hostelName !== undefined) {
    if (typeof body.hostelName !== "string" || !body.hostelName.trim()) {
      throw new Error("Hostel name is required");
    }

    output.hostelName = body.hostelName.trim();

    if (output.hostelName.length > 120) {
      throw new Error("Hostel name is too long");
    }
  }

  if (creating || body.hostelCode !== undefined) {
    const code = String(body.hostelCode || "")
      .trim()
      .toUpperCase();

    if (!CODE_PATTERN.test(code)) {
      throw new Error("Valid Hostel Code is required (e.g. H1)");
    }

    output.hostelCode = code;
  }

  if (body.hostelType !== undefined) {
    const type = String(body.hostelType).toUpperCase();

    if (!TYPES.has(type)) {
      throw new Error("Invalid hostel type");
    }

    output.hostelType = type;
  }

  if (body.totalFloors !== undefined) {
    const floors = Number(body.totalFloors);

    if (!Number.isInteger(floors) || floors < 0 || floors > 100) {
      throw new Error("Total floors must be from 0 to 100");
    }

    output.totalFloors = floors;
  }

  if (body.description !== undefined) {
    if (
      typeof body.description !== "string" ||
      body.description.length > 1000
    ) {
      throw new Error("Description must be at most 1000 characters");
    }

    output.description = body.description.trim();
  }

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      throw new Error("Invalid status");
    }

    output.isActive = body.isActive;
  }

  return output;
}

// ==========================================
// CHECK DUPLICATE HOSTEL CODE OR NAME
// ==========================================

async function hasDuplicate(code, name, excludedId = null) {
  const rows = await Hostel.find(
    excludedId
      ? {
          _id: {
            $ne: excludedId,
          },
        }
      : {},
  )
    .select("hostelCode hostelName")
    .lean();

  return rows.some(
    (hostel) =>
      codeOf(hostel) === code ||
      hostel.hostelName.toLowerCase() === name.toLowerCase(),
  );
}

// ==========================================
// GET HOSTEL BY ID
// ==========================================

async function getHostelOrRespond(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({
      success: false,
      message: "Invalid hostel ID",
    });

    return null;
  }

  const hostel = await Hostel.findById(req.params.id);

  if (!hostel) {
    res.status(404).json({
      success: false,
      message: "Hostel not found",
    });

    return null;
  }

  return hostel;
}

// ==========================================
// ERROR HANDLER
// ==========================================

function handleError(res, error) {
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "Hostel name/code already exists",
    });
  }

  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid hostel details",
    });
  }

  if (error.isInputError) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  console.error("HOSTEL MANAGEMENT ERROR:", error);

  return res.status(500).json({
    success: false,
    message: "Hostel operation failed",
  });
}

function parseInput(body, opts) {
  try {
    return inputFields(body, opts);
  } catch (error) {
    error.isInputError = true;
    throw error;
  }
}

// ==========================================
// GET ALL HOSTELS
// ==========================================

exports.getAllHostels = async (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === "true";

    const query = includeArchived
      ? {}
      : {
          isDeleted: {
            $ne: true,
          },
          isActive: {
            $ne: false,
          },
        };

    const records = await Hostel.find(query)
      .sort({
        hostelName: 1,
      })
      .lean();

    const hostels = records.map(present);

    return res.json({
      success: true,
      hostels,

      analytics: {
        totalHostels: hostels.filter((h) => h.isDeleted !== true).length,

        activeHostels: hostels.filter(
          (h) => h.isActive !== false && h.isDeleted !== true,
        ).length,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// CREATE HOSTEL
// ==========================================

exports.createHostel = async (req, res) => {
  try {
    const fields = parseInput(req.body || {}, {
      creating: true,
    });

    if (await hasDuplicate(fields.hostelCode, fields.hostelName)) {
      return res.status(409).json({
        success: false,
        message: "Hostel code or name already exists",
      });
    }

    const hostel = await Hostel.create({
      ...fields,
      isActive: true,
      isDeleted: false,
    });

    return res.status(201).json({
      success: true,
      hostel: present(hostel.toObject()),
      message: "Hostel created",
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// UPDATE HOSTEL
// ==========================================

exports.updateHostel = async (req, res) => {
  try {
    const hostel = await getHostelOrRespond(req, res);

    if (!hostel) return;

    if (hostel.isDeleted) {
      return res.status(409).json({
        success: false,
        message: "Restore hostel before editing",
      });
    }

    const fields = parseInput(req.body || {});

    const currentCode = codeOf(hostel);

    if (fields.hostelCode && currentCode && fields.hostelCode !== currentCode) {
      return res.status(409).json({
        success: false,
        message: "Hostel Code cannot be changed after creation",
      });
    }

    if (
      await hasDuplicate(
        fields.hostelCode || currentCode,
        fields.hostelName || hostel.hostelName,
        hostel._id,
      )
    ) {
      return res.status(409).json({
        success: false,
        message: "Hostel name or code already exists",
      });
    }

    if (fields.isActive === false && hostel.isActive !== false) {
      const reason = await dependencyMessage(hostel);

      if (reason) {
        return res.status(409).json({
          success: false,
          message: reason,
        });
      }
    }

    Object.assign(hostel, fields);

    await hostel.save();

    return res.json({
      success: true,
      hostel: present(hostel.toObject()),
      message: "Hostel updated",
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// ARCHIVE HOSTEL
// ==========================================

exports.deleteHostel = async (req, res) => {
  try {
    const hostel = await getHostelOrRespond(req, res);

    if (!hostel) return;

    if (hostel.isDeleted) {
      return res.status(409).json({
        success: false,
        message: "Hostel already archived",
      });
    }

    const reason = await dependencyMessage(hostel);

    if (reason) {
      return res.status(409).json({
        success: false,
        message: reason,
      });
    }

    hostel.isDeleted = true;
    hostel.isActive = false;

    await hostel.save();

    return res.json({
      success: true,
      message: "Hostel archived; history preserved",
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// RESTORE HOSTEL
// ==========================================

exports.restoreHostel = async (req, res) => {
  try {
    const hostel = await getHostelOrRespond(req, res);

    if (!hostel) return;

    hostel.isDeleted = false;
    hostel.isActive = true;

    await hostel.save();

    return res.json({
      success: true,
      hostel: present(hostel.toObject()),
      message: "Hostel restored",
    });
  } catch (error) {
    return handleError(res, error);
  }
};
