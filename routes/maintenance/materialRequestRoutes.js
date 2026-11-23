"use strict";

const express = require("express");
const router = express.Router();
const Inventory = require("../../models/Inventory");
const InventoryCategory = require("../../models/InventoryCategory");
const {
  getAllMaterialRequests,
  getMyMaterialRequests,
  getComplaintMaterialRequests,
  createMaterialRequest,
  deleteMaterialRequest,
  approveTechnicianMaterialRequest,
  rejectTechnicianMaterialRequest,
} = require("../../controllers/maintenance/materialRequestController");

const { protect } = require("../../middleware/authMiddleware");
const roleMiddleware = require("../../middleware/roleMiddleware");

// ==========================================
// ROLE ACCESS
// ==========================================

const managerAccess = [protect, roleMiddleware("MAINTENANCE_MANAGER")];

const technicianAccess = [protect, roleMiddleware("TECHNICIAN")];

const managerAndStoreAccess = [
  protect,
  roleMiddleware("MAINTENANCE_MANAGER", "STORE_MANAGER"),
];

const requesterAccess = [
  protect,
  roleMiddleware("MAINTENANCE_MANAGER", "TECHNICIAN"),
];

// ==========================================
// EXISTING ROUTES
// ==========================================

router.get("/catalog", ...managerAccess, async (req, res) => {
  try {
    const [categoryRecords, inventory] = await Promise.all([
      InventoryCategory.find({}).select("name").sort({ name: 1 }).lean(),

      Inventory.find({
        isActive: { $ne: false },
      })
        .select(
          "itemCode itemName itemDescription category otherCategory unit currentStock",
        )
        .lean(),
    ]);

    // Only Store Manager-created categories.
    // No hardcoded or automatically imported categories.
    const categories = categoryRecords
      .map((record) => String(record.name || "").trim())
      .filter(Boolean);

    const categoryMap = new Map(
      categories.map((name) => [name.toLowerCase(), name]),
    );

    const items = inventory.flatMap((item) => {
      const baseCategory = String(item.category || "").trim();

      const rawCategory = /^others?$/i.test(baseCategory)
        ? String(item.otherCategory || "").trim()
        : baseCategory;

      const categoryName = categoryMap.get(rawCategory.toLowerCase());

      // Uncategorized / unassigned items are excluded.
      if (!categoryName) return [];

      const itemName = String(
        item.itemName || item.itemDescription || "",
      ).trim();

      if (!itemName) return [];

      return [
        {
          _id: String(item._id),
          itemCode: item.itemCode || "",
          itemName,
          categoryName,
          unit: item.unit || "Nos",
          currentStock: Number(item.currentStock || 0),
        },
      ];
    });

    items.sort(
      (a, b) =>
        a.categoryName.localeCompare(b.categoryName) ||
        a.itemName.localeCompare(b.itemName),
    );

    return res.status(200).json({
      success: true,
      source: "CATEGORY_MASTER",
      categories,
      items,
    });
  } catch (error) {
    console.error("MATERIAL CATALOG ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load inventory material catalog.",
    });
  }
});

// Manager and Store Manager
router.get("/", ...managerAndStoreAccess, getAllMaterialRequests);

// Technician requests
router.get("/my-requests", ...technicianAccess, getMyMaterialRequests);

// Complaint-wise requests
router.get(
  "/complaint/:complaintId",
  ...requesterAccess,
  getComplaintMaterialRequests,
);

// Create material request
router.post("/create", ...requesterAccess, createMaterialRequest);

// Delete pending material request
router.delete("/:id", ...managerAccess, deleteMaterialRequest);

router.put(
  "/:id/manager-approve",
  ...managerAccess,
  approveTechnicianMaterialRequest,
);

router.put(
  "/:id/manager-reject",
  ...managerAccess,
  rejectTechnicianMaterialRequest,
);

module.exports = router;
