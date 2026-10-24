"use strict";

const mongoose = require("mongoose");

const Hostel = require("../../models/Hostel");
const User = require("../../models/User");
const Complaint = require("../../models/Complaint");

const TYPES = new Set(["BOYS", "GIRLS", "CO-ED", "STAFF"]);

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,11}$/;

const normalize = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

// ==========================================
// LEGACY HOSTEL CODE
// ==========================================

const legacyCode = (name) =>
  String(name || "")
    .match(/\b(H\d+[A-Z]?)\b/i)?.[1]
    ?.toUpperCase() || "";

const codeOf = (hostel) =>
  normalize(hostel.hostelCode) || legacyCode(hostel.hostelName);

const present = (hostel) => ({
  ...hostel,
  hostelCode: codeOf(hostel),
});

const regexEscape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ==========================================
// HOSTEL ALIASES
// ==========================================

const aliasesFor = (hostel) => {
  const code = codeOf(hostel);

  return [
    ...new Set(
      [
        hostel.hostelName,
        code,
        code ? `Hostel ${code}` : "",
        code ? `Boys Hostel ${code}` : "",
        code ? `Girls Hostel ${code}` : "",
        code ? `Faculty Hostel ${code}` : "",
      ]
        .filter(Boolean)
        .map((item) => String(item).trim()),
    ),
  ];
};

const aliasesAsRegex = (hostel) =>
  aliasesFor(hostel).map(
    (value) => new RegExp(`^\\s*${regexEscape(value)}\\s*$`, "i"),
  );

// ==========================================
// CHECK HOSTEL DEPENDENCIES
// ==========================================

const dependencyCheck = async (hostel, { permanent = false } = {}) => {
  const aliasRegex = aliasesAsRegex(hostel);

  const personRefs = {
    $or: [
      {
        assignedHostel: {
          $in: aliasRegex,
        },
      },
      {
        hostel: {
          $in: aliasRegex,
        },
      },
    ],
  };

  const activeWarden = await User.exists({
    role: "WARDEN",
    isActive: true,
    isDeleted: { $ne: true },
    assignedHostel: {
      $in: aliasRegex,
    },
  });

  const currentHosteller = await User.exists({
    role: "STUDENT",
    isHosteller: true,

    studentStatus: {
      $ne: "LEFT_HOSTEL",
    },

    isDeleted: {
      $ne: true,
    },

    hostel: {
      $in: aliasRegex,
    },
  });

  const openComplaint = await Complaint.exists({
    complaintArea: "HOSTEL",

    hostel: {
      $in: aliasRegex,
    },

    status: {
      $nin: ["COMPLETED", "RESOLVED", "CLOSED"],
    },
  });

  if (activeWarden) {
    return "Reassign the active Warden " + "before archiving this hostel";
  }

  if (currentHosteller) {
    return "Move current hostel residents " + "before archiving this hostel";
  }

  if (openComplaint) {
    return "Resolve or reassign open hostel " + "complaints first";
  }

  if (!permanent) {
    return null;
  }

  // ======================================
  // HISTORICAL ACCOUNT REFERENCES
  // ======================================

  if (await User.exists(personRefs)) {
    return "Hostel has staff/student account history; " + "keep it archived";
  }

  // ======================================
  // HISTORICAL COMPLAINT REFERENCES
  // ======================================

  if (
    await Complaint.exists({
      hostel: {
        $in: aliasRegex,
      },
    })
  ) {
    return "Hostel has complaint history; " + "keep it archived";
  }

  // ======================================
  // LEGACY COLLECTION REFERENCES
  // ======================================

  const collectionNames = [
    "rooms",
    "roomallocations",
    "locations",
    "jobcards",
    "maintenancetasks",
    "maintenancehistories",
  ];

  for (const name of collectionNames) {
    const collection = mongoose.connection.db?.collection(name);

    if (!collection) continue;

    const linked = await collection.findOne(
      {
        $or: [
          {
            hostel: {
              $in: aliasRegex,
            },
          },
          {
            hostel: hostel._id,
          },
          {
            hostelName: {
              $in: aliasRegex,
            },
          },
          {
            hostelCode: {
              $in: aliasRegex,
            },
          },
          {
            hostelId: hostel._id,
          },
          {
            hostelRef: hostel._id,
          },
          {
            locationCode: {
              $in: aliasRegex,
            },
          },
        ],
      },
      {
        projection: {
          _id: 1,
        },
      },
    );

    if (linked) {
      return `Hostel has legacy ${name} records; ` + "keep it archived";
    }
  }

  return null;
};

// ==========================================
// VALIDATE INPUT
// ==========================================

const parseInput = (body, { creating = false } = {}) => {
  const data = {};

  if (creating || body.hostelName !== undefined) {
    if (
      typeof body.hostelName !== "string" ||
      !body.hostelName.trim() ||
      body.hostelName.trim().length > 120
    ) {
      throw new Error(
        "Valid hostel name is required " + "(max 120 characters)",
      );
    }

    data.hostelName = body.hostelName.trim();
  }

  if (creating || body.hostelCode !== undefined) {
    const code = normalize(body.hostelCode);

    if (!CODE_PATTERN.test(code)) {
      throw new Error("Valid Hostel Code is required (e.g. H1)");
    }

    data.hostelCode = code;
  }

  if (body.hostelType !== undefined) {
    const type = normalize(body.hostelType);

    if (!TYPES.has(type)) {
      throw new Error("Invalid hostel type");
    }

    data.hostelType = type;
  }

  if (body.totalFloors !== undefined) {
    const n = Number(body.totalFloors);

    if (!Number.isInteger(n) || n < 0 || n > 100) {
      throw new Error("Total floors must be 0–100");
    }

    data.totalFloors = n;
  }

  if (body.description !== undefined) {
    if (
      typeof body.description !== "string" ||
      body.description.length > 1000
    ) {
      throw new Error("Description is too long");
    }

    data.description = body.description.trim();
  }

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      throw new Error("Invalid status");
    }

    data.isActive = body.isActive;
  }

  return data;
};

// ==========================================
// CHECK DUPLICATE CODE / NAME
// ==========================================

const hasDuplicate = async (code, name, excludedId) => {
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
      normalize(hostel.hostelName) === normalize(name),
  );
};

// ==========================================
// GET HOSTEL BY ID
// ==========================================

const getById = async (req, res) => {
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
  }

  return hostel;
};

// ==========================================
// ERROR HANDLER
// ==========================================

const fail = (res, error) => {
  if (error?.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "Hostel name/code already exists",
    });
  }

  if (
    error?.name === "ValidationError" ||
    error?.name === "CastError" ||
    error?.isInputError
  ) {
    return res.status(400).json({
      success: false,
      message: error?.isInputError ? error.message : "Invalid hostel details",
    });
  }

  console.error("HOSTEL ERROR:", error);

  return res.status(500).json({
    success: false,
    message: "Hostel operation failed",
  });
};

const readInput = (body, options) => {
  try {
    return parseInput(body || {}, options);
  } catch (error) {
    error.isInputError = true;
    throw error;
  }
};

// ==========================================
// GET ALL HOSTELS
// ==========================================

const getAllHostels = async (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === "true";

    const filter = includeArchived
      ? {}
      : {
          isDeleted: { $ne: true },
          isActive: { $ne: false },
        };

    const [rows, totalHostels, activeHostels, archivedHostels] =
      await Promise.all([
        Hostel.find(filter).sort({ hostelName: 1 }).lean(),

        Hostel.countDocuments({
          isDeleted: { $ne: true },
        }),

        Hostel.countDocuments({
          isDeleted: { $ne: true },
          isActive: { $ne: false },
        }),

        Hostel.countDocuments({
          isDeleted: true,
        }),
      ]);

    return res.json({
      success: true,

      hostels: rows.map(present),

      analytics: {
        totalHostels,
        activeHostels,
        archivedHostels,
        inactiveHostels: totalHostels - activeHostels,
      },
    });
  } catch (error) {
    return fail(res, error);
  }
};

// ==========================================
// CREATE HOSTEL
// ==========================================

const createHostel = async (req, res) => {
  try {
    const data = readInput(req.body, {
      creating: true,
    });

    if (await hasDuplicate(data.hostelCode, data.hostelName)) {
      return res.status(409).json({
        success: false,
        message: "Hostel name or code already exists",
      });
    }

    const hostel = await Hostel.create({
      ...data,
      isActive: true,
      isDeleted: false,
    });

    return res.status(201).json({
      success: true,
      hostel: present(hostel.toObject()),
      message: "Hostel created",
    });
  } catch (error) {
    return fail(res, error);
  }
};

// ==========================================
// UPDATE HOSTEL
// ==========================================

const updateHostel = async (req, res) => {
  try {
    const hostel = await getById(req, res);

    if (!hostel) return;

    if (hostel.isDeleted) {
      return res.status(409).json({
        success: false,
        message: "Restore hostel before editing",
      });
    }

    const data = readInput(req.body);
    const code = codeOf(hostel);

    if (data.hostelCode && code && data.hostelCode !== code) {
      return res.status(409).json({
        success: false,
        message: "Hostel Code cannot change after creation",
      });
    }

    if (
      await hasDuplicate(
        data.hostelCode || code,
        data.hostelName || hostel.hostelName,
        hostel._id,
      )
    ) {
      return res.status(409).json({
        success: false,
        message: "Hostel name or code already exists",
      });
    }

    if (
      data.hostelName &&
      normalize(data.hostelName) !== normalize(hostel.hostelName)
    ) {
      const historicalReason = await dependencyCheck(hostel, {
        permanent: true,
      });

      if (historicalReason) {
        return res.status(409).json({
          success: false,
          message:
            "Hostel has linked records. Keep " +
            "its current name or migrate references first",
        });
      }
    }

    if (data.isActive === false && hostel.isActive !== false) {
      const reason = await dependencyCheck(hostel);

      if (reason) {
        return res.status(409).json({
          success: false,
          message: reason,
        });
      }
    }

    Object.assign(hostel, data);

    await hostel.save();

    return res.json({
      success: true,
      hostel: present(hostel.toObject()),
      message: "Hostel updated",
    });
  } catch (error) {
    return fail(res, error);
  }
};

// ==========================================
// ARCHIVE HOSTEL
// ==========================================

const deleteHostel = async (req, res) => {
  try {
    const hostel = await getById(req, res);

    if (!hostel) return;

    if (hostel.isDeleted) {
      return res.status(409).json({
        success: false,
        message: "Hostel already archived",
      });
    }

    const reason = await dependencyCheck(hostel);

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
    return fail(res, error);
  }
};

// ==========================================
// PERMANENT DELETE HOSTEL
// ==========================================

const permanentDeleteHostel = async (req, res) => {
  try {
    const hostel = await getById(req, res);

    if (!hostel) return;

    if (!hostel.isDeleted) {
      return res.status(409).json({
        success: false,
        message: "Archive the hostel before permanent deletion",
      });
    }

    const reason = await dependencyCheck(hostel, {
      permanent: true,
    });

    if (reason) {
      return res.status(409).json({
        success: false,
        message: reason,
      });
    }

    await Hostel.deleteOne({
      _id: hostel._id,
      isDeleted: true,
    });

    return res.json({
      success: true,
      message: "Unreferenced hostel permanently deleted",
    });
  } catch (error) {
    return fail(res, error);
  }
};

// ==========================================
// RESTORE HOSTEL
// ==========================================

const restoreHostel = async (req, res) => {
  try {
    const hostel = await getById(req, res);

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
    return fail(res, error);
  }
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  createHostel,
  getAllHostels,
  updateHostel,
  deleteHostel,
  restoreHostel,
  permanentDeleteHostel,
};
