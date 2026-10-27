"use strict";

const mongoose = require("mongoose");

const Hostel = require("../../models/Hostel");
const Category = require("../../models/Category");

// =====================================================
// COMMON HELPERS
// =====================================================

const text = (value) => String(value ?? "").trim();

const upper = (value) => text(value).toUpperCase();

const idOf = (value) => text(value?._id || value?.id || value);

const isActive = (doc) =>
  !!doc &&
  doc.isActive !== false &&
  doc.isDeleted !== true &&
  doc.isArchived !== true &&
  !["INACTIVE", "ARCHIVED", "DELETED"].includes(upper(doc.status));

const sortByName = (a, b) =>
  a.name.localeCompare(b.name, undefined, {
    numeric: true,
  });

// =====================================================
// UNIQUE CATEGORY / LOCATION NAMES
// =====================================================

function uniqueNames(values) {
  const seen = new Set();

  return (Array.isArray(values) ? values : [])
    .map((value) =>
      typeof value === "string"
        ? text(value)
        : text(
            value?.name ||
              value?.subCategoryName ||
              value?.areaName ||
              value?.label,
          ),
    )
    .filter((name) => {
      const key = upper(name);

      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

// =====================================================
// HOSTEL CODE SUPPORT
//
// NEW: hostelCode = H1
// OLD: hostelName = Boys Hostel H1
// =====================================================

function getHostelCode(hostel) {
  const explicit = upper(hostel.hostelCode || hostel.code);

  if (explicit) {
    return explicit;
  }

  const legacy = text(hostel.hostelName || hostel.name).match(
    /\b(H\d+[A-Z]?)\b/i,
  );

  return legacy ? upper(legacy[1]) : "";
}

// =====================================================
// GET ADMIN COLLECTION
//
// First use registered Mongoose model.
// Otherwise locate the existing MongoDB collection.
// =====================================================

async function resolveCollection(modelName, candidates) {
  const db = mongoose.connection.db;

  if (!db) {
    throw new Error("MongoDB is not connected");
  }

  const collections = (
    await db.listCollections({}, { nameOnly: true }).toArray()
  ).map((item) => item.name);

  const registered = mongoose.models[modelName]?.collection?.name;

  if (registered && collections.includes(registered)) {
    return db.collection(registered);
  }

  const name = candidates.find((candidate) => collections.includes(candidate));

  return name ? db.collection(name) : null;
}

// =====================================================
// LOAD ALL ADMIN-CREATED FORM DATA
// =====================================================

async function loadComplaintFormCatalog() {
  const db = mongoose.connection.db;

  if (!db) {
    throw new Error("MongoDB is not connected");
  }

  // ===================================================
  // FIND ADMIN COLLECTIONS
  // ===================================================

  const [blockCollection, otherCollection] = await Promise.all([
    resolveCollection("Block", [
      "blocks",
      "academicblocks",
      "buildings",
      "academicbuildings",
    ]),

    resolveCollection("OtherLocation", [
      "otherlocations",
      "other_locations",
      "otherlocationmasters",
    ]),
  ]);

  if (!blockCollection) {
    throw new Error("Admin Academic Block collection not found");
  }

  // ===================================================
  // ACTIVE FILTER
  //
  // Hostel uses same active rules as Admin:
  // isActive != false
  // isDeleted != true
  // ===================================================

  const activeHostelQuery = {
    isActive: { $ne: false },
    isDeleted: { $ne: true },
  };

  const activeMasterQuery = {
    ...activeHostelQuery,
    isArchived: { $ne: true },
  };

  // ===================================================
  // FETCH ALL MASTER RECORDS
  // ===================================================

  const [hostelDocs, blockDocs, otherDocs, categoryDocs] = await Promise.all([
    Hostel.find(activeHostelQuery)
      .select("hostelName hostelCode hostelType totalFloors isActive isDeleted")
      .lean(),

    blockCollection.find(activeMasterQuery).toArray(),

    otherCollection
      ? otherCollection.find(activeMasterQuery).toArray()
      : Promise.resolve([]),

    Category.find({
      ...activeMasterQuery,
      department: "MAINTENANCE",
    }).lean(),
  ]);

  // ===================================================
  // 1. ADMIN-CREATED HOSTELS
  // ===================================================

  const hostels = hostelDocs
    .filter(isActive)
    .map((hostel) => ({
      id: idOf(hostel._id),

      type: "HOSTEL",

      code: getHostelCode(hostel),

      name: text(hostel.hostelName || hostel.name),

      hostelType: upper(hostel.hostelType || "BOYS"),

      totalFloors: hostel.totalFloors ?? null,
    }))

    // Do not hide older Hostels just because
    // hostelCode is not separately stored.
    .filter((hostel) => hostel.id && hostel.name)
    .sort(sortByName);

  // ===================================================
  // 2. ADMIN-CREATED ACADEMIC BLOCKS
  // ===================================================

  const academicBlocks = blockDocs
    .filter(isActive)
    .map((block) => ({
      id: idOf(block._id),

      type: "BLOCK",

      code: upper(block.code || block.blockCode || block.buildingCode),

      name: text(block.name || block.blockName || block.buildingName),

      departments: uniqueNames(block.departments),

      startFloor: text(block.startFloor),

      endFloor: text(block.endFloor),
    }))
    .filter((block) => block.id && block.code && block.name)
    .sort(sortByName);

  // ===================================================
  // 3. ADMIN-CREATED OTHER LOCATIONS
  // ===================================================

  const otherLocations = otherDocs
    .filter(isActive)
    .map((location) => ({
      id: idOf(location._id),

      type: "OTHER",

      code: upper(location.code || location.locationCode),

      name: text(location.name || location.locationName),

      category: text(location.category),

      areas: uniqueNames(location.areas),
    }))
    .filter((location) => location.id && location.name)
    .sort(sortByName);

  // ===================================================
  // 4. ADMIN-CREATED MAINTENANCE CATEGORIES
  // ===================================================

  const categories = categoryDocs
    .filter(isActive)
    .map((category) => ({
      id: idOf(category._id),

      name: text(category.categoryName || category.name),

      priority: ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(
        upper(category.priority),
      )
        ? upper(category.priority)
        : "MEDIUM",

      icon: text(category.icon),

      description: text(category.description),

      subCategories: uniqueNames(category.subCategories),
    }))
    .filter((category) => category.id && category.name)
    .sort(sortByName);

  // ===================================================
  // DEBUG LOGS
  //
  // Useful for finding why Student cannot see Hostels.
  // Logs only counts, not Student data.
  // ===================================================

  if (process.env.NODE_ENV !== "production") {
    let totalHostels = null;

    if (hostels.length === 0) {
      totalHostels = await Hostel.countDocuments({});
    }

    console.log("[STUDENT COMPLAINT FORM]", {
      database: db.databaseName,

      hostelCollection: Hostel.collection.name,

      activeHostelDocuments: hostelDocs.length,

      hostelsReturned: hostels.length,

      totalHostelsWhenEmpty: totalHostels,

      academicBlocks: academicBlocks.length,

      otherLocations: otherLocations.length,

      categories: categories.length,
    });
  }

  // ===================================================
  // RETURN CONFIGURATION
  // ===================================================

  return {
    hostels,
    academicBlocks,
    otherLocations,
    categories,
  };
}

// =====================================================
// GET /api/student/complaint-form-config
// =====================================================

async function getComplaintFormConfig(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Login required",
      });
    }

    if (upper(req.user.role) !== "STUDENT") {
      return res.status(403).json({
        success: false,
        message: "Student access only",
      });
    }

    const catalog = await loadComplaintFormCatalog();

    return res.status(200).json({
      success: true,
      ...catalog,
    });
  } catch (error) {
    console.error("STUDENT COMPLAINT FORM CONFIG ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load Admin-created complaint options",
    });
  }
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  getComplaintFormConfig,
  loadComplaintFormCatalog,
};
