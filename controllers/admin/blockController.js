"use strict";

const mongoose = require("mongoose");
const Block = require("../../models/Block");
const User = require("../../models/User");
const Complaint = require("../../models/Complaint");

// ==========================================
// CONFIGURATION
// ==========================================

const FLOORS = [
  "Ground",
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
  "Eighth",
];

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,11}$/;

const VALID_FIELDS = ["buildingType", "roomRange", "description"];

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const exact = (value) => new RegExp(`^\\s*${escapeRegex(value)}\\s*$`, "i");

// ==========================================
// BLOCK REFERENCES
// ==========================================

function aliases(block) {
  const code = String(block.code || "").trim();

  return [
    ...new Set(
      [
        code,
        `Block ${code}`,
        `Academic Block ${code}`,
        String(block.name || "").trim(),
      ].filter(Boolean),
    ),
  ].map(exact);
}

// ==========================================
// INPUT ERROR
// ==========================================

function badInput(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

// ==========================================
// VALIDATE INPUT
// ==========================================

function validateFields(body = {}, creating = false) {
  const result = {};

  if (creating || body.name !== undefined) {
    if (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.trim().length > 120
    ) {
      throw badInput("Block name is required (maximum 120 characters)");
    }

    result.name = body.name.trim();
  }

  for (const key of VALID_FIELDS) {
    if (body[key] !== undefined) {
      const limits = {
        buildingType: 100,
        roomRange: 100,
        description: 1000,
      };

      if (typeof body[key] !== "string" || body[key].length > limits[key]) {
        throw badInput(
          `${key} must be text (maximum ${limits[key]} characters)`,
        );
      }

      result[key] = body[key].trim();
    }
  }

  for (const key of ["startFloor", "endFloor"]) {
    if (body[key] !== undefined) {
      if (!FLOORS.includes(body[key])) {
        throw badInput("Invalid floor selection");
      }

      result[key] = body[key];
    }
  }

  if (body.departments !== undefined) {
    if (
      !Array.isArray(body.departments) ||
      body.departments.some((name) => typeof name !== "string")
    ) {
      throw badInput("Departments must be a list of names");
    }

    const departments = body.departments
      .map((name) => name.trim())
      .filter(Boolean);

    if (
      departments.length > 100 ||
      departments.some((name) => name.length > 120)
    ) {
      throw badInput("Invalid department list");
    }

    if (
      new Set(departments.map((name) => name.toLowerCase())).size !==
      departments.length
    ) {
      throw badInput("Duplicate department name");
    }

    result.departments = departments;
  }

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      throw badInput("Invalid active status");
    }

    result.isActive = body.isActive;
  }

  return result;
}

// ==========================================
// FIND BLOCK
// ==========================================

async function getBlock(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({
      success: false,
      message: "Invalid Academic Block ID",
    });

    return null;
  }

  const block = await Block.findById(req.params.id);

  if (!block) {
    res.status(404).json({
      success: false,
      message: "Academic Block not found",
    });

    return null;
  }

  return block;
}

// ==========================================
// ERROR HANDLER
// ==========================================

function onError(res, error) {
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "Academic Block code already exists",
    });
  }

  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  if (["ValidationError", "CastError"].includes(error.name)) {
    return res.status(400).json({
      success: false,
      message: "Invalid Academic Block data",
    });
  }

  console.error("ACADEMIC BLOCK ERROR:", error);

  return res.status(500).json({
    success: false,
    message: "Academic Block operation failed",
  });
}

// ==========================================
// CHECK ALL KNOWN DEPENDENCIES
// ==========================================

async function dependencyReport(block, { checkExtra = false } = {}) {
  const refs = aliases(block);

  const [activeAdmins, allUsers, currentUsers, allComplaints, openComplaints] =
    await Promise.all([
      User.find({
        role: "BLOCK_ADMIN",

        assignedBlock: {
          $in: refs,
        },

        isActive: {
          $ne: false,
        },

        isDeleted: {
          $ne: true,
        },
      })
        .select("_id name email assignedBlock")
        .lean(),

      User.countDocuments({
        $or: [
          {
            assignedBlock: {
              $in: refs,
            },
          },
          {
            departmentBlock: {
              $in: refs,
            },
          },
          {
            block: {
              $in: refs,
            },
          },
        ],
      }),

      User.countDocuments({
        isActive: {
          $ne: false,
        },

        isDeleted: {
          $ne: true,
        },

        $or: [
          {
            departmentBlock: {
              $in: refs,
            },
          },
          {
            block: {
              $in: refs,
            },
          },
        ],
      }),

      Complaint.countDocuments({
        $or: [
          {
            block: {
              $in: refs,
            },
          },
          {
            issueLocation: {
              $in: refs,
            },
          },
        ],
      }),

      Complaint.countDocuments({
        $or: [
          {
            block: {
              $in: refs,
            },
          },
          {
            issueLocation: {
              $in: refs,
            },
          },
        ],

        status: {
          $nin: ["COMPLETED", "RESOLVED", "CLOSED"],
        },
      }),
    ]);

  const report = {
    blockCode: block.code,

    activeBlockAdmins: activeAdmins,

    activeBlockAdminCount: activeAdmins.length,

    linkedUserCount: allUsers,

    currentUserCount: currentUsers,

    complaintCount: allComplaints,

    openComplaintCount: openComplaints,

    otherReferences: [],
  };

  if (!checkExtra) {
    return report;
  }

  // Scan direct references in known
  // legacy maintenance collections.

  const candidates = new Set([
    "locations",
    "buildings",
    "rooms",
    "jobcards",
    "maintenancetasks",
    "maintenancehistories",
    "workorders",
    "materialrequests",
    "issueditems",
  ]);

  const database = mongoose.connection.db;

  if (!database) {
    throw new Error("Database connection is unavailable");
  }

  const collections = await database
    .listCollections({}, { nameOnly: true })
    .toArray();

  for (const { name } of collections) {
    if (!candidates.has(name.toLowerCase())) {
      continue;
    }

    const fields = [
      "block",
      "blockCode",
      "blockName",
      "academicBlock",
      "departmentBlock",
      "assignedBlock",
      "locationCode",
      "buildingName",
      "issueLocation",
    ];

    const found = await database.collection(name).findOne(
      {
        $or: [
          ...fields.map((field) => ({
            [field]: {
              $in: refs,
            },
          })),

          {
            blockId: block._id,
          },

          {
            blockRef: block._id,
          },

          {
            buildingId: block._id,
          },
        ],
      },
      {
        projection: {
          _id: 1,
        },
      },
    );

    if (found) {
      report.otherReferences.push(name);
    }
  }

  return report;
}

// ==========================================
// BLOCKING REASON
// ==========================================

function blockingMessage(report) {
  if (report.activeBlockAdminCount) {
    return (
      "An active Block Admin is assigned. " +
      "Reassign or deactivate that account first."
    );
  }

  if (report.currentUserCount) {
    return "Active users are mapped to this block. " + "Reassign them first.";
  }

  if (report.openComplaintCount) {
    return (
      "Open complaints reference this block. " +
      "Finish or transfer them first."
    );
  }

  return null;
}

// ==========================================
// GET BLOCKS
// ==========================================

exports.getBlocks = async (req, res) => {
  try {
    const filter =
      req.query.includeArchived === "true"
        ? {}
        : {
            isActive: {
              $ne: false,
            },

            isDeleted: {
              $ne: true,
            },
          };

    const [blocks, total, active, archived] = await Promise.all([
      Block.find(filter).sort({ code: 1 }).lean(),

      Block.countDocuments({
        isDeleted: {
          $ne: true,
        },
      }),

      Block.countDocuments({
        isDeleted: {
          $ne: true,
        },
        isActive: {
          $ne: false,
        },
      }),

      Block.countDocuments({
        isDeleted: true,
      }),
    ]);

    return res.json({
      success: true,
      blocks,

      analytics: {
        total,
        active,
        archived,
      },
    });
  } catch (error) {
    return onError(res, error);
  }
};

// ==========================================
// GET BLOCK DEPENDENCIES
// ==========================================

exports.getBlockDependencies = async (req, res) => {
  try {
    const block = await getBlock(req, res);

    if (!block) return;

    const dependencies = await dependencyReport(block, {
      checkExtra: true,
    });

    return res.json({
      success: true,
      dependencies,
    });
  } catch (error) {
    return onError(res, error);
  }
};

// ==========================================
// CREATE BLOCK
// ==========================================

exports.createBlock = async (req, res) => {
  try {
    const code = String(req.body?.code || "")
      .trim()
      .toUpperCase();

    if (!CODE_PATTERN.test(code)) {
      throw badInput("Enter a valid unique Block Code");
    }

    const fields = validateFields(req.body, true);

    const start = FLOORS.indexOf(fields.startFloor || "Ground");

    const end = FLOORS.indexOf(fields.endFloor || "Fourth");

    if (start > end) {
      throw badInput("End floor must not be before start floor");
    }

    const block = await Block.create({
      code,
      ...fields,
      isActive: true,
      isDeleted: false,
    });

    return res.status(201).json({
      success: true,
      message: "Academic Block created",
      block,
    });
  } catch (error) {
    return onError(res, error);
  }
};

// ==========================================
// UPDATE BLOCK
// ==========================================

exports.updateBlock = async (req, res) => {
  try {
    const block = await getBlock(req, res);

    if (!block) return;

    if (block.isDeleted) {
      return res.status(409).json({
        success: false,
        message: "Restore this block before editing",
      });
    }

    if (
      req.body?.code !== undefined &&
      String(req.body.code).trim().toUpperCase() !== block.code
    ) {
      throw badInput("Block Code cannot change after creation");
    }

    const fields = validateFields(req.body);

    const start = FLOORS.indexOf(fields.startFloor || block.startFloor);

    const end = FLOORS.indexOf(fields.endFloor || block.endFloor);

    if (start > end) {
      throw badInput("End floor must not be before start floor");
    }

    if (fields.isActive === false && block.isActive !== false) {
      const dependencies = await dependencyReport(block);

      const reason = blockingMessage(dependencies);

      if (reason) {
        return res.status(409).json({
          success: false,
          message: reason,
          dependencies,
        });
      }
    }

    Object.assign(block, fields);

    await block.save();

    return res.json({
      success: true,
      message: "Academic Block updated",
      block,
    });
  } catch (error) {
    return onError(res, error);
  }
};

// ==========================================
// ARCHIVE BLOCK
// ==========================================

exports.archiveBlock = async (req, res) => {
  try {
    const block = await getBlock(req, res);

    if (!block) return;

    if (block.isDeleted) {
      return res.status(409).json({
        success: false,
        message: "Block is already archived",
      });
    }

    const dependencies = await dependencyReport(block);

    const reason = blockingMessage(dependencies);

    if (reason) {
      return res.status(409).json({
        success: false,
        message: reason,
        dependencies,
      });
    }

    block.isDeleted = true;
    block.isActive = false;

    await block.save();

    return res.json({
      success: true,
      message: "Academic Block archived; history preserved",
      block,
    });
  } catch (error) {
    return onError(res, error);
  }
};

// ==========================================
// RESTORE BLOCK
// ==========================================

exports.restoreBlock = async (req, res) => {
  try {
    const block = await getBlock(req, res);

    if (!block) return;

    if (!block.isDeleted) {
      return res.json({
        success: true,
        message: "Block is already active",
        block,
      });
    }

    block.isDeleted = false;
    block.isActive = true;

    await block.save();

    return res.json({
      success: true,
      message: "Academic Block restored",
      block,
    });
  } catch (error) {
    return onError(res, error);
  }
};

// ==========================================
// PERMANENT DELETE BLOCK
// ==========================================

exports.permanentDeleteBlock = async (req, res) => {
  try {
    const block = await getBlock(req, res);

    if (!block) return;

    if (!block.isDeleted) {
      return res.status(409).json({
        success: false,
        message: "Archive the block before permanent deletion",
      });
    }

    const dependencies = await dependencyReport(block, {
      checkExtra: true,
    });

    if (
      dependencies.linkedUserCount ||
      dependencies.complaintCount ||
      dependencies.otherReferences.length
    ) {
      return res.status(409).json({
        success: false,

        message:
          "Block is referenced by existing records. Keep it archived or migrate references first.",

        dependencies,
      });
    }

    const result = await Block.deleteOne({
      _id: block._id,
      isDeleted: true,
    });

    if (!result.deletedCount) {
      return res.status(409).json({
        success: false,
        message: "Block has changed; refresh first",
      });
    }

    return res.json({
      success: true,
      message: "Unreferenced Academic Block permanently deleted",
    });
  } catch (error) {
    return onError(res, error);
  }
};
