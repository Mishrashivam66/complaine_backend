"use strict";

const mongoose = require("mongoose");
const Hostel = require("../../models/Hostel");
const Category = require("../../models/Category");

const string = (value) => String(value ?? "").trim();
const upper = (value) => string(value).toUpperCase();
const idOf = (value) => string(value?._id || value?.id || value);

const isActive = (item) =>
  Boolean(item) &&
  item.isActive !== false &&
  item.isDeleted !== true &&
  item.isArchived !== true &&
  !["INACTIVE", "ARCHIVED", "DELETED"].includes(upper(item.status));

const uniqueText = (values) => {
  const seen = new Set();

  return (Array.isArray(values) ? values : [])
    .map((value) =>
      typeof value === "string"
        ? string(value)
        : string(value?.name || value?.subCategoryName || value?.areaName),
    )
    .filter((value) => {
      const key = upper(value);

      if (!key || seen.has(key)) return false;

      seen.add(key);
      return true;
    });
};

// =====================================================
// RESOLVE EXISTING ADMIN COLLECTIONS
// =====================================================

async function getCollectionByModelOrName(modelName, names) {
  const db = mongoose.connection.db;

  if (!db) {
    throw new Error("Database is not connected");
  }

  const model = mongoose.models[modelName];

  if (model?.collection?.name) {
    return db.collection(model.collection.name);
  }

  const existing = (
    await db.listCollections({}, { nameOnly: true }).toArray()
  ).map(({ name }) => name);

  const collectionName = names.find((name) => existing.includes(name));

  return collectionName ? db.collection(collectionName) : null;
}

// =====================================================
// SHARED ADMIN MASTER DATA
// =====================================================

async function loadComplaintFormCatalog() {
  const [blockCollection, otherCollection] = await Promise.all([
    getCollectionByModelOrName("Block", [
      "blocks",
      "academicblocks",
      "buildings",
      "academicbuildings",
    ]),

    getCollectionByModelOrName("OtherLocation", [
      "otherlocations",
      "other_locations",
      "otherlocationmasters",
    ]),
  ]);

  const activeFilter = {
    isActive: { $ne: false },
    isDeleted: { $ne: true },
    isArchived: { $ne: true },
  };

  const [hostelDocs, blockDocs, otherDocs, categoryDocs] = await Promise.all([
    Hostel.find(activeFilter).lean(),

    blockCollection
      ? blockCollection.find(activeFilter).toArray()
      : Promise.resolve([]),

    otherCollection
      ? otherCollection.find(activeFilter).toArray()
      : Promise.resolve([]),

    Category.find({
      ...activeFilter,
      department: "MAINTENANCE",
    }).lean(),
  ]);

  const byName = (a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
    });

  // ===================================================
  // 1. ADMIN HOSTELS
  // ===================================================

  const hostels = hostelDocs
    .filter(isActive)
    .map((item) => ({
      id: idOf(item._id),
      type: "HOSTEL",

      code: string(item.hostelCode).toUpperCase(),
      name: string(item.hostelName),

      hostelType: upper(item.hostelType),
      totalFloors: item.totalFloors ?? null,
    }))
    .filter((item) => item.code && item.name)
    .sort(byName);

  // ===================================================
  // 2. ACADEMIC BLOCKS
  // ===================================================

  const academicBlocks = blockDocs
    .filter(isActive)
    .map((item) => ({
      id: idOf(item._id),
      type: "BLOCK",

      code: upper(item.code),
      name: string(item.name),

      buildingType: string(item.buildingType),
      startFloor: string(item.startFloor),
      endFloor: string(item.endFloor),
      roomRange: string(item.roomRange),

      departments: uniqueText(item.departments),
    }))
    .filter((item) => item.code && item.name)
    .sort(byName);

  // ===================================================
  // 3. OTHER LOCATIONS CREATED BY ADMIN
  // ===================================================

  const otherLocations = otherDocs
    .filter(isActive)
    .map((item) => ({
      id: idOf(item._id),
      type: "OTHER",

      code: upper(item.code),
      name: string(item.name),

      category: string(item.category),
      areas: uniqueText(item.areas),
    }))
    .filter((item) => item.code && item.name)
    .sort(byName);

  // ===================================================
  // 4. ADMIN MAINTENANCE CATEGORIES
  // ===================================================

  const categories = categoryDocs
    .filter(isActive)
    .map((item) => ({
      id: idOf(item._id),

      name: string(item.categoryName),
      department: "MAINTENANCE",

      priority: ["LOW", "MEDIUM", "HIGH"].includes(upper(item.priority))
        ? upper(item.priority)
        : "MEDIUM",

      icon: string(item.icon),
      description: string(item.description),

      subCategories: uniqueText(item.subCategories),
    }))
    .filter((item) => item.name)
    .sort(byName);

  // ===================================================
  // RESPONSE FOR STUDENT FORM
  // ===================================================

  return {
    hostels,
    academicBlocks,
    otherLocations,
    categories,

    // A separate internal-location master for Hostel
    // and Block has not been configured here.
    locations: [],
  };
}

// =====================================================
// STUDENT GET FORM CONFIG API
// =====================================================

const getComplaintFormConfig = async (req, res) => {
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
    console.error("STUDENT FORM CONFIG ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load Admin-created complaint options",
    });
  }
};

module.exports = {
  getComplaintFormConfig,
  loadComplaintFormCatalog,
};
