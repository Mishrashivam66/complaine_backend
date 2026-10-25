"use strict";

const mongoose = require("mongoose");
const Hostel = require("../../models/Hostel");
const User = require("../../models/User");
const Complaint = require("../../models/Complaint");

const TYPES = new Set(["BOYS", "GIRLS", "CO-ED", "STAFF"]);
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,11}$/;
const CLOSED = ["COMPLETED", "RESOLVED", "CLOSED"];

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const legacyCode = (name) =>
  String(name ?? "")
    .match(/\b(H\d+[A-Z]?)\b/i)?.[1]
    ?.toUpperCase() || "";

const codeOf = (hostel) =>
  normalize(hostel.hostelCode) || legacyCode(hostel.hostelName);

const present = (hostel) => ({
  ...hostel,
  hostelCode: codeOf(hostel),
});

const regexEscape = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function hostelAliases(hostel) {
  const code = codeOf(hostel);

  return [
    ...new Set(
      [
        hostel.hostelName,
        code,
        code && `Hostel ${code}`,
        code && `Boys Hostel ${code}`,
        code && `Girls Hostel ${code}`,
        code && `Faculty Hostel ${code}`,
      ]
        .filter(Boolean)
        .map((value) => String(value).trim()),
    ),
  ].map((value) => new RegExp(`^\\s*${regexEscape(value)}\\s*$`, "i"));
}

function badInput(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

// ==========================================
// VALIDATE HOSTEL FIELDS
// ==========================================

function parseFields(body = {}, { creating = false } = {}) {
  const fields = {};

  if (creating || body.hostelName !== undefined) {
    if (
      typeof body.hostelName !== "string" ||
      !body.hostelName.trim() ||
      body.hostelName.trim().length > 120
    ) {
      throw badInput("Hostel name is required (max 120 characters)");
    }

    fields.hostelName = body.hostelName.trim();
  }

  if (creating || body.hostelCode !== undefined) {
    const code = normalize(body.hostelCode);

    if (!CODE_PATTERN.test(code)) {
      throw badInput("Valid Hostel Code is required (e.g. H1)");
    }

    fields.hostelCode = code;
  }

  if (body.hostelType !== undefined) {
    const type = normalize(body.hostelType);

    if (!TYPES.has(type)) {
      throw badInput("Invalid hostel type");
    }

    fields.hostelType = type;
  }

  if (body.totalFloors !== undefined) {
    const n = Number(body.totalFloors);

    if (!Number.isInteger(n) || n < 0 || n > 100) {
      throw badInput("Total floors must be from 0 to 100");
    }

    fields.totalFloors = n;
  }

  if (body.description !== undefined) {
    if (
      typeof body.description !== "string" ||
      body.description.length > 1000
    ) {
      throw badInput("Description must be text with maximum 1000 characters");
    }

    fields.description = body.description.trim();
  }

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      throw badInput("Invalid hostel status");
    }

    fields.isActive = body.isActive;
  }

  return fields;
}

// ==========================================
// UNIQUE HOSTEL VALIDATION
// ==========================================

async function duplicateFound(code, name, excludedId) {
  const rows = await Hostel.find(excludedId ? { _id: { $ne: excludedId } } : {})
    .select("hostelName hostelCode")
    .lean();

  return rows.some(
    (item) =>
      codeOf(item) === code || normalize(item.hostelName) === normalize(name),
  );
}

async function findHostel(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({
      success: false,
      message: "Invalid Hostel ID",
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
}

function handleError(res, error) {
  if (error?.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "Hostel name/code already exists",
    });
  }

  if (
    error?.statusCode ||
    ["ValidationError", "CastError"].includes(error?.name)
  ) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.statusCode ? error.message : "Invalid Hostel details",
    });
  }

  console.error("HOSTEL MANAGEMENT ERROR:", error);

  return res.status(500).json({
    success: false,
    message: "Hostel operation failed",
  });
}

// ==========================================
// CHECK HOSTEL DEPENDENCIES
// ==========================================

async function dependencyReport(hostel, { checkExtra = false } = {}) {
  const refs = hostelAliases(hostel);

  const userRefs = {
    $or: [{ assignedHostel: { $in: refs } }, { hostel: { $in: refs } }],
  };

  const complaintRefs = {
    hostel: { $in: refs },
  };

  const [
    activeWardens,
    currentResidents,
    openComplaints,
    linkedUsers,
    complaintCount,
  ] = await Promise.all([
    User.find({
      role: "WARDEN",
      assignedHostel: { $in: refs },
      isActive: { $ne: false },
      isDeleted: { $ne: true },
    })
      .select("name email assignedHostel")
      .lean(),

    User.countDocuments({
      role: "STUDENT",
      isHosteller: true,
      hostel: { $in: refs },
      isDeleted: { $ne: true },
      studentStatus: { $ne: "LEFT_HOSTEL" },
    }),

    Complaint.countDocuments({
      ...complaintRefs,
      status: { $nin: CLOSED },
    }),

    User.countDocuments(userRefs),

    Complaint.countDocuments(complaintRefs),
  ]);

  const report = {
    hostelCode: codeOf(hostel),
    hostelName: hostel.hostelName,

    activeWardens,
    activeWardenCount: activeWardens.length,

    currentResidentCount: currentResidents,
    openComplaintCount: openComplaints,

    linkedUserCount: linkedUsers,
    complaintCount,

    otherReferences: [],
    fullyChecked: checkExtra,
  };

  if (!checkExtra) {
    return report;
  }

  const database = mongoose.connection.db;

  if (!database) {
    throw new Error("Database is not connected");
  }

  // Only check explicit hostel references.
  // Do not match unrelated Building names.

  const collectionsToCheck = new Set([
    "rooms",
    "roomallocations",
    "locations",
    "jobcards",
    "maintenancetasks",
    "maintenancehistories",
    "workorders",
    "materialrequests",
    "issueditems",
    "studenthistories",
    "notices",
    "emergencyalerts",
  ]);

  const available = await database
    .listCollections({}, { nameOnly: true })
    .toArray();

  for (const { name } of available) {
    if (!collectionsToCheck.has(name.toLowerCase())) {
      continue;
    }

    const fields = ["hostel", "hostelName", "hostelCode", "assignedHostel"];

    const candidates = [
      ...fields.map((field) => ({
        [field]: { $in: refs },
      })),

      ...["hostel", "hostelId", "hostelRef"].map((field) => ({
        [field]: hostel._id,
      })),
    ];

    const found = await database
      .collection(name)
      .findOne({ $or: candidates }, { projection: { _id: 1 } });

    if (found) {
      report.otherReferences.push(name);
    }
  }

  return report;
}

// ==========================================
// DEPENDENCY BLOCKING RULES
// ==========================================

function activeBlockingReasons(report) {
  const reasons = [];

  if (report.activeWardenCount) {
    reasons.push("Reassign the active Warden before archiving this hostel");
  }

  if (report.currentResidentCount) {
    reasons.push("Move current hostel residents before archiving this hostel");
  }

  if (report.openComplaintCount) {
    reasons.push("Resolve or reassign open hostel complaints first");
  }

  return reasons;
}

function permanentBlockingReasons(report) {
  return [
    ...activeBlockingReasons(report),

    ...(report.linkedUserCount
      ? ["Hostel has linked staff/student account history"]
      : []),

    ...(report.complaintCount ? ["Hostel has existing complaint history"] : []),

    ...(report.otherReferences.length
      ? [`Hostel is referenced in: ${report.otherReferences.join(", ")}`]
      : []),
  ];
}

// ==========================================
// GET ALL HOSTELS
// ==========================================

exports.getAllHostels = async (req, res) => {
  try {
    const query =
      req.query.includeArchived === "true"
        ? {}
        : {
            isDeleted: { $ne: true },
            isActive: { $ne: false },
          };

    const [records, totalHostels, activeHostels, archivedHostels] =
      await Promise.all([
        Hostel.find(query).sort({ hostelName: 1 }).lean(),

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
      hostels: records.map(present),

      analytics: {
        totalHostels,
        activeHostels,
        archivedHostels,
        inactiveHostels: totalHostels - activeHostels,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// GET HOSTEL DEPENDENCIES
// ==========================================

exports.getHostelDependencies = async (req, res) => {
  try {
    const hostel = await findHostel(req, res);

    if (!hostel) return;

    const dependencies = await dependencyReport(hostel, { checkExtra: true });

    return res.json({
      success: true,
      dependencies,
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
    const data = parseFields(req.body, {
      creating: true,
    });

    if (await duplicateFound(data.hostelCode, data.hostelName)) {
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
      message: "Hostel created",
      hostel: present(hostel.toObject()),
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
    const hostel = await findHostel(req, res);

    if (!hostel) return;

    if (hostel.isDeleted) {
      return res.status(409).json({
        success: false,
        message: "Restore hostel before editing",
      });
    }

    const changes = parseFields(req.body);
    const code = codeOf(hostel);

    if (changes.hostelCode && code && changes.hostelCode !== code) {
      return res.status(409).json({
        success: false,
        message: "Hostel Code cannot change after creation",
      });
    }

    if (
      await duplicateFound(
        changes.hostelCode || code,
        changes.hostelName || hostel.hostelName,
        hostel._id,
      )
    ) {
      return res.status(409).json({
        success: false,
        message: "Hostel name or code already exists",
      });
    }

    if (
      changes.hostelName &&
      normalize(changes.hostelName) !== normalize(hostel.hostelName)
    ) {
      const history = await dependencyReport(hostel, { checkExtra: true });

      if (permanentBlockingReasons(history).length) {
        return res.status(409).json({
          success: false,

          message:
            "Hostel has existing references. Migrate references before renaming this hostel.",

          dependencies: history,
        });
      }
    }

    if (changes.isActive === false && hostel.isActive !== false) {
      const report = await dependencyReport(hostel);
      const problems = activeBlockingReasons(report);

      if (problems.length) {
        return res.status(409).json({
          success: false,
          message: problems[0],
          dependencies: report,
        });
      }
    }

    Object.assign(hostel, changes);
    await hostel.save();

    return res.json({
      success: true,
      message: "Hostel updated",
      hostel: present(hostel.toObject()),
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
    const hostel = await findHostel(req, res);

    if (!hostel) return;

    if (hostel.isDeleted) {
      return res.status(409).json({
        success: false,
        message: "Hostel already archived",
      });
    }

    const report = await dependencyReport(hostel);
    const problems = activeBlockingReasons(report);

    if (problems.length) {
      return res.status(409).json({
        success: false,
        message: problems[0],
        dependencies: report,
      });
    }

    hostel.isDeleted = true;
    hostel.isActive = false;

    await hostel.save();

    return res.json({
      success: true,
      message: "Hostel archived; history preserved",
      hostel: present(hostel.toObject()),
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
    const hostel = await findHostel(req, res);

    if (!hostel) return;

    if (!hostel.isDeleted) {
      return res.json({
        success: true,
        message: "Hostel is not archived",
        hostel: present(hostel.toObject()),
      });
    }

    hostel.isDeleted = false;
    hostel.isActive = true;

    await hostel.save();

    return res.json({
      success: true,
      message: "Hostel restored",
      hostel: present(hostel.toObject()),
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// PERMANENT DELETE HOSTEL
// ==========================================

exports.permanentDeleteHostel = async (req, res) => {
  try {
    const hostel = await findHostel(req, res);

    if (!hostel) return;

    if (!hostel.isDeleted) {
      return res.status(409).json({
        success: false,
        message: "Archive hostel before permanent deletion",
      });
    }

    const report = await dependencyReport(hostel, { checkExtra: true });

    const problems = permanentBlockingReasons(report);

    if (problems.length) {
      return res.status(409).json({
        success: false,
        message: problems[0],
        dependencies: report,
      });
    }

    const deleted = await Hostel.deleteOne({
      _id: hostel._id,
      isDeleted: true,
    });

    if (!deleted.deletedCount) {
      return res.status(409).json({
        success: false,
        message: "Hostel changed; refresh and retry",
      });
    }

    return res.json({
      success: true,
      message: "Unreferenced hostel permanently deleted",
    });
  } catch (error) {
    return handleError(res, error);
  }
};
