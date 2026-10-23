"use strict";

const mongoose = require("mongoose");

const OtherLocation = require("../../models/OtherLocation");
const Block = require("../../models/Block");
const Hostel = require("../../models/Hostel");
const Complaint = require("../../models/Complaint");

const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{0,11}$/;

const CLOSED = ["COMPLETED", "RESOLVED", "CLOSED"];

// ==========================================
// REGEX SAFETY
// ==========================================

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ==========================================
// VALIDATE INPUT
// ==========================================

function validate(body, creating = false) {
  const data = {};

  const fields = [
    ["name", 120, true],
    ["category", 80, false],
    ["description", 1000, false],
  ];

  for (const [field, limit, required] of fields) {
    if (creating || body[field] !== undefined) {
      if (typeof body[field] !== "string") {
        throw new Error(`${field} must be text`);
      }

      const value = body[field].trim();

      if ((required && !value) || value.length > limit) {
        throw new Error(`Invalid ${field} (max ${limit} characters)`);
      }

      data[field] = field === "category" ? value || "GENERAL" : value;
    }
  }

  // ======================================
  // MULTIPLE AREAS
  // ======================================

  if (body.areas !== undefined) {
    if (!Array.isArray(body.areas) || body.areas.length > 50) {
      throw new Error("Areas must be a list of 50 or fewer entries");
    }

    const cleaned = body.areas
      .map((value) => {
        if (typeof value !== "string" || value.trim().length > 120) {
          throw new Error("Invalid area name");
        }

        return value.trim();
      })
      .filter(Boolean);

    const names = cleaned.map((value) => value.toLowerCase());

    if (new Set(names).size !== cleaned.length) {
      throw new Error("Duplicate area names are not allowed");
    }

    data.areas = cleaned;
  }

  // ======================================
  // STATUS
  // ======================================

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      throw new Error("isActive must be true or false");
    }

    data.isActive = body.isActive;
  }

  return data;
}

// ==========================================
// RESPONSES
// ==========================================

const invalid = (res, message) =>
  res.status(400).json({
    success: false,
    message,
  });

const errorResponse = (res, error) => {
  if (error?.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "Location code already exists",
    });
  }

  if (error?.name === "ValidationError" || error?.name === "CastError") {
    return invalid(res, "Invalid location data");
  }

  console.error("OTHER LOCATION ERROR:", error);

  return res.status(500).json({
    success: false,
    message: "Location operation failed",
  });
};

// ==========================================
// FIND BY ID
// ==========================================

async function findOne(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    invalid(res, "Invalid location ID");
    return null;
  }

  const location = await OtherLocation.findById(req.params.id);

  if (!location) {
    res.status(404).json({
      success: false,
      message: "Location not found",
    });

    return null;
  }

  return location;
}

// ==========================================
// CHECK CODE CONFLICT
// ==========================================

async function codeReserved(code) {
  const hostelName = new RegExp(`(?:^|\\s)${escapeRegex(code)}$`, "i");

  const [block, hostel] = await Promise.all([
    Block.exists({
      code,
    }),

    Hostel.exists({
      $or: [{ hostelCode: code }, { hostelName }],
    }),
  ]);

  return Boolean(block || hostel);
}

// ==========================================
// CHECK LINKED OPEN COMPLAINTS
// ==========================================

// Legacy complaints store issueLocation as
// text. This checks exact known references.
// Future complaint APIs should also save a
// stable Other Location ID or code.

async function hasOpenComplaints(location) {
  const aliases = [location.name, location.code].filter(Boolean);

  return Boolean(
    await Complaint.exists({
      complaintArea: "CAMPUS",

      status: {
        $nin: CLOSED,
      },

      issueLocation: {
        $in: aliases,
      },
    }),
  );
}

// ==========================================
// GET ALL OTHER LOCATIONS
// ==========================================

exports.getAllOtherLocations = async (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === "true";

    const locations = await OtherLocation.find(
      includeArchived
        ? {}
        : {
            isDeleted: { $ne: true },
            isActive: true,
          },
    )
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      locations,
    });
  } catch (error) {
    return errorResponse(res, error);
  }
};

// ==========================================
// CREATE OTHER LOCATION
// ==========================================

exports.createOtherLocation = async (req, res) => {
  try {
    const code = String(req.body?.code || "")
      .trim()
      .toUpperCase();

    if (!CODE_RE.test(code)) {
      return invalid(res, "Use a valid code, e.g. SC, LIB or PARK");
    }

    let fields;

    try {
      fields = validate(req.body || {}, true);
    } catch (error) {
      return invalid(res, error.message);
    }

    // Avoid codes belonging to Blocks/Hostels.
    if (await codeReserved(code)) {
      return res.status(409).json({
        success: false,
        message: "Code belongs to an Academic Block or Hostel",
      });
    }

    // ======================================
    // CHECK DUPLICATE NAME
    // ======================================

    const sameName = await OtherLocation.exists({
      name: new RegExp(`^${escapeRegex(fields.name)}$`, "i"),
    });

    if (sameName) {
      return res.status(409).json({
        success: false,
        message: "Location name already exists",
      });
    }

    // ======================================
    // SAVE
    // ======================================

    const location = await OtherLocation.create({
      code,
      ...fields,
    });

    return res.status(201).json({
      success: true,
      message: "Other Location created",
      location,
    });
  } catch (error) {
    return errorResponse(res, error);
  }
};

// ==========================================
// UPDATE OTHER LOCATION
// ==========================================

exports.updateOtherLocation = async (req, res) => {
  try {
    const location = await findOne(req, res);

    if (!location) return;

    if (location.isDeleted) {
      return res.status(409).json({
        success: false,
        message: "Restore location before editing",
      });
    }

    // Location codes are immutable.
    if (
      req.body?.code !== undefined &&
      String(req.body.code).trim().toUpperCase() !== location.code
    ) {
      return invalid(
        res,
        "Location code cannot change. Archive it and create a new code if necessary.",
      );
    }

    let changes;

    try {
      changes = validate(req.body || {});
    } catch (error) {
      return invalid(res, error.message);
    }

    // ======================================
    // DUPLICATE NAME CHECK
    // ======================================

    if (
      changes.name &&
      changes.name.toLowerCase() !== location.name.toLowerCase()
    ) {
      const duplicate = await OtherLocation.exists({
        _id: {
          $ne: location._id,
        },

        name: new RegExp(`^${escapeRegex(changes.name)}$`, "i"),
      });

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "Location name already exists",
        });
      }
    }

    // ======================================
    // PREVENT UNSAFE DEACTIVATION
    // ======================================

    if (changes.isActive === false && (await hasOpenComplaints(location))) {
      return res.status(409).json({
        success: false,
        message: "Resolve or reassign linked open complaints first",
      });
    }

    Object.assign(location, changes);

    await location.save();

    return res.status(200).json({
      success: true,
      message: "Location updated",
      location,
    });
  } catch (error) {
    return errorResponse(res, error);
  }
};

// ==========================================
// ARCHIVE LOCATION
// ==========================================

exports.archiveOtherLocation = async (req, res) => {
  try {
    const location = await findOne(req, res);

    if (!location) return;

    if (location.isDeleted) {
      return res.status(409).json({
        success: false,
        message: "Already archived",
      });
    }

    if (await hasOpenComplaints(location)) {
      return res.status(409).json({
        success: false,
        message: "Resolve or reassign linked open complaints first",
      });
    }

    location.isDeleted = true;
    location.isActive = false;
    location.archivedAt = new Date();

    await location.save();

    return res.status(200).json({
      success: true,
      message: "Location archived; history preserved",
    });
  } catch (error) {
    return errorResponse(res, error);
  }
};

// ==========================================
// RESTORE LOCATION
// ==========================================

exports.restoreOtherLocation = async (req, res) => {
  try {
    const location = await findOne(req, res);

    if (!location) return;

    location.isDeleted = false;
    location.isActive = true;
    location.archivedAt = null;

    await location.save();

    return res.status(200).json({
      success: true,
      message: "Location restored",
      location,
    });
  } catch (error) {
    return errorResponse(res, error);
  }
};
