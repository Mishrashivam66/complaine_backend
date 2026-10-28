const mongoose = require("mongoose");

const Inventory = require("../../models/Inventory");
const MaterialRequest = require("../../models/MaterialRequest");
const IssuedItem = require("../../models/IssuedItem");
const StockTransaction = require("../../models/StockTransaction");
const User = require("../../models/User");

// ==========================================
// HELPERS
// ==========================================

const clean = (value) => String(value ?? "").trim();

const round = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;

const validQty = (value) =>
  Number.isFinite(value) &&
  value > 0 &&
  Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7;

const getId = (value) => {
  if (!value) return "";

  return String(value._id || value);
};

function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function stockStatus(quantity, minimum) {
  if (quantity <= 0) return "Out Of Stock";
  if (quantity <= minimum) return "Low Stock";
  return "Available";
}

function issueVoucherNumber() {
  return (
    `AMI-IV-${Date.now()}-` +
    Math.random().toString(36).slice(2, 8).toUpperCase()
  );
}

function requestStatus(materials) {
  const statuses = materials.map((material) => material.status);

  if (!statuses.length) return "PENDING";

  const totalIssued = materials.reduce(
    (sum, material) => sum + Number(material.issuedQuantity || 0),
    0,
  );

  const anyPending = statuses.includes("PENDING");

  const anyApproved = statuses.some((status) =>
    ["APPROVED", "PARTIALLY_ISSUED"].includes(status),
  );

  const allIssued = statuses.every((status) => status === "ISSUED");

  if (allIssued) return "ISSUED";

  if (totalIssued > 0) {
    return "PARTIALLY_ISSUED";
  }

  if (anyApproved && anyPending) {
    return "PARTIALLY_APPROVED";
  }

  if (anyApproved) {
    return "APPROVED_BY_STORE";
  }

  if (statuses.every((status) => status === "REJECTED")) {
    return "REJECTED";
  }

  if (
    statuses.every((status) => ["OUT_OF_STOCK", "REJECTED"].includes(status))
  ) {
    return "OUT_OF_STOCK";
  }

  return "PENDING";
}

function respondError(res, error) {
  console.error("ISSUED ITEM ERROR:", error);

  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "Duplicate issue record detected.",
    });
  }

  if (
    error.code === 112 ||
    error.hasErrorLabel?.("TransientTransactionError") ||
    /WriteConflict/i.test(error.message || "")
  ) {
    return res.status(409).json({
      success: false,
      message: "Inventory was updated concurrently. Refresh and retry.",
    });
  }

  return res.status(500).json({
    success: false,
    message: "Material issue operation failed.",
  });
}

// ==========================================
// VERIFY ACTUAL RECEIVING TECHNICIAN
// ==========================================

async function resolveReceiver({
  receiverUserId,
  assignedWorkerId,
  receiverName,
  technicianId,
  session,
}) {
  const assignedId = getId(assignedWorkerId);
  const selectedId = clean(receiverUserId);

  if (selectedId && !mongoose.isValidObjectId(selectedId)) {
    fail("Invalid receiver User ID.");
  }

  // If the frontend has no receiverUserId,
  // default to the assigned Technician only.
  // Never resolve user identity by typed name.
  const verifiedId = selectedId || assignedId;

  if (!verifiedId || !mongoose.isValidObjectId(verifiedId)) {
    fail(
      "No verified receiving Technician found. Select a valid Technician account.",
      400,
    );
  }

  const technician = await User.findById(verifiedId).session(session).lean();

  if (!technician) {
    fail("Receiving Technician account not found.", 404);
  }

  const normalizedRole = clean(technician.role).toUpperCase();

  if (!["WORKER", "TECHNICIAN"].includes(normalizedRole)) {
    fail("Selected receiver is not a Technician account.", 403);
  }

  // Different schemas can use different identifiers.
  const verifiedTechnicianId = clean(
    technician.technicianId ||
      technician.workerId ||
      technician.employeeId ||
      "",
  );

  const verifiedName = clean(technician.name);

  if (!verifiedName) {
    fail("Receiving Technician account has no name.", 409);
  }

  // Old issue forms send receiverName and technicianId.
  // Reject conflicting typed identity instead of
  // silently binding the material to someone else.
  if (
    receiverName &&
    receiverName.toLowerCase() !== verifiedName.toLowerCase()
  ) {
    fail("Receiver name does not match the selected Technician account.", 409);
  }

  if (
    technicianId &&
    verifiedTechnicianId &&
    technicianId.toUpperCase() !== verifiedTechnicianId.toUpperCase()
  ) {
    fail("Technician ID does not match the selected Technician account.", 409);
  }

  // If a different Technician is collecting material,
  // explicit receiverUserId is mandatory.
  if (assignedId && verifiedId !== assignedId && !selectedId) {
    fail("Select the actual receiving Technician.", 400);
  }

  return {
    userId: technician._id,
    name: verifiedName,
    technicianId: verifiedTechnicianId,
  };
}

// ==========================================
// POST /api/store/issued-items/issue
// ==========================================

exports.issueItem = async (req, res) => {
  const materialRequestId = clean(
    req.body?.materialRequestId || req.body?.requestId,
  );

  const materialItemId = clean(req.body?.materialItemId);

  const quantity = Number(req.body?.quantity);

  const receiverUserId = clean(req.body?.receiverUserId);

  const receiverName = clean(req.body?.receiverName || req.body?.issuedTo);

  const technicianId = clean(req.body?.technicianId);

  const remarks = clean(req.body?.remarks);

  const retrievalRequired = req.body?.retrievalRequired === true;

  const expectedRetrievalQty = retrievalRequired
    ? Number(req.body?.expectedRetrievalQty ?? quantity)
    : 0;

  // ==========================================
  // BASIC VALIDATION
  // ==========================================

  if (!req.user?._id) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  if (
    !mongoose.isValidObjectId(materialRequestId) ||
    !mongoose.isValidObjectId(materialItemId)
  ) {
    return res.status(400).json({
      success: false,
      message: "Valid material request and item IDs are required.",
    });
  }

  if (!validQty(quantity)) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid issue quantity.",
    });
  }

  if (
    retrievalRequired &&
    (!validQty(expectedRetrievalQty) || expectedRetrievalQty > quantity)
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Expected retrieval quantity must be greater than zero and cannot exceed issued quantity.",
    });
  }

  const session = await mongoose.startSession();

  try {
    let result = null;

    await session.withTransaction(async () => {
      // ======================================
      // MATERIAL REQUEST
      // ======================================

      const request =
        await MaterialRequest.findById(materialRequestId).session(session);

      if (!request) {
        fail("Material request not found.", 404);
      }

      const material = request.materials.id(materialItemId);

      if (!material) {
        fail("Requested material not found.", 404);
      }

      if (!["APPROVED", "PARTIALLY_ISSUED"].includes(material.status)) {
        fail("Material must be approved before issue.", 409);
      }

      const approved = round(material.approvedQuantity || 0);

      const alreadyIssued = round(material.issuedQuantity || 0);

      const remaining = round(approved - alreadyIssued);

      if (remaining <= 0) {
        fail("Approved material quantity has already been issued.", 409);
      }

      if (quantity > remaining) {
        fail(`Only ${remaining} approved units remain to be issued.`, 409);
      }

      // ======================================
      // VERIFY RECEIVER
      // ======================================

      const assignedWorkerId = getId(request.assignedWorker);

      const receiver = await resolveReceiver({
        receiverUserId,
        assignedWorkerId,
        receiverName,
        technicianId,
        session,
      });

      // ======================================
      // INVENTORY MATCH
      // ======================================

      const matching = await Inventory.find({
        itemName: material.itemName,
        isActive: { $ne: false },
      })
        .collation({
          locale: "en",
          strength: 2,
        })
        .session(session);

      if (!matching.length) {
        fail(`Inventory item "${material.itemName}" not found.`, 404);
      }

      if (matching.length > 1) {
        fail(
          "Multiple inventory items have the same name. Item Code mapping is required before issue.",
          409,
        );
      }

      const inventory = matching[0];

      const requestedUnit = clean(material.unit).toLowerCase();

      const inventoryUnit = clean(inventory.unit).toLowerCase();

      if (requestedUnit && inventoryUnit && requestedUnit !== inventoryUnit) {
        fail(
          `UOM mismatch. Request: ${material.unit}, Inventory: ${inventory.unit}.`,
          409,
        );
      }

      // ======================================
      // ATOMIC STOCK DEDUCTION
      // ======================================

      const before = round(inventory.currentStock || 0);

      if (before < quantity) {
        fail(
          `Insufficient stock. Available: ${before} ${inventory.unit}.`,
          409,
        );
      }

      const updatedInventory = await Inventory.findOneAndUpdate(
        {
          _id: inventory._id,
          isActive: { $ne: false },
          currentStock: {
            $gte: quantity,
          },
        },
        {
          $inc: {
            currentStock: -quantity,
            outgoingQuantity: quantity,
          },
        },
        {
          new: true,
          runValidators: true,
          session,
        },
      );

      if (!updatedInventory) {
        fail("Inventory balance changed. Refresh and retry.", 409);
      }

      const after = round(updatedInventory.currentStock);

      await Inventory.updateOne(
        { _id: updatedInventory._id },
        {
          $set: {
            status: stockStatus(
              after,
              Number(updatedInventory.minimumStock || 0),
            ),
          },
        },
        { session },
      );

      // ======================================
      // UPDATE MATERIAL REQUEST
      // ======================================

      material.issuedQuantity = round(alreadyIssued + quantity);

      material.status =
        material.issuedQuantity >= approved ? "ISSUED" : "PARTIALLY_ISSUED";

      request.status = requestStatus(request.materials);

      if (!request.issuedBy) {
        request.issuedBy = req.user._id;
      }

      request.issuedAt = new Date();

      // ======================================
      // CREATE ISSUE VOUCHER
      // ======================================

      const voucherNo = issueVoucherNumber();

      if (!request.storeSlipNo) {
        request.storeSlipNo = voucherNo;
      }

      await request.save({ session });

      // ======================================
      // CREATE ISSUED ITEM
      // ======================================

      const [issuedItem] = await IssuedItem.create(
        [
          {
            materialRequest: request._id,

            materialItemId: material._id,

            complaint: request.complaint || null,

            jobCard: request.jobCard || null,

            inventoryItem: inventory._id,

            itemCode: inventory.itemCode || "",

            item: inventory.itemName,

            unit: inventory.unit,

            quantity,

            hostel: request.hostel || "",

            block: request.block || "",

            // Verified receiver identity
            issuedTo: receiver.name,

            assignedTechnician: request.assignedWorker || null,

            receivedByTechnician: receiver.userId,

            technicianId: receiver.technicianId,

            receiverTechnicianId: receiver.technicianId,

            voucherNo,

            storeSlipNo: voucherNo,

            issuedBy: req.user._id,

            issuedDate: new Date(),

            status: "Issued",

            remarks,

            // Technician must confirm separately
            receivingStatus: "AWAITING_CONFIRMATION",

            receivedQuantity: 0,

            shortageQuantity: 0,

            receivingConfirmedAt: null,

            receivingRemarks: "",

            // Old damaged material tracking
            retrievalRequired,

            expectedRetrievalQty,

            retrievedQuantity: 0,

            retrievalStatus: retrievalRequired
              ? "PENDING_RETRIEVAL"
              : "NOT_REQUIRED",
          },
        ],
        { session },
      );

      // ======================================
      // STOCK TRANSACTION LEDGER
      // ======================================

      await StockTransaction.create(
        [
          {
            inventoryItem: inventory._id,

            itemCode: inventory.itemCode || "",

            itemName: inventory.itemName,

            unit: inventory.unit,

            type: "ISSUE",

            quantity,

            balanceBefore: before,

            balanceAfter: after,

            referenceNo: voucherNo,

            transactionDate: new Date(),

            performedBy: req.user._id,

            remarks:
              `Material issued to ${receiver.name}` +
              ` (${receiver.technicianId || receiver.userId}).` +
              ` Request: ${request.requestId || request._id}. ` +
              remarks,
          },
        ],
        { session },
      );

      // ======================================
      // RESULT
      // ======================================

      result = {
        issuedItem,

        voucherNo,

        stockBefore: before,

        stockAfter: after,

        issuedQuantity: quantity,

        receiver: {
          userId: receiver.userId,
          name: receiver.name,
          technicianId: receiver.technicianId,
        },

        receivingStatus: "AWAITING_CONFIRMATION",

        requestStatus: request.status,

        remainingApprovedQuantity: round(approved - material.issuedQuantity),
      };
    });

    return res.status(201).json({
      success: true,
      message:
        "Material issued successfully. Technician receiving confirmation is pending.",
      ...result,
    });
  } catch (error) {
    return respondError(res, error);
  } finally {
    await session.endSession();
  }
};

// ==========================================
// GET /api/store/issued-items/all
// ==========================================

exports.getIssuedItems = async (req, res) => {
  try {
    const issuedItems = await IssuedItem.find()
      .populate("materialRequest", "requestId status materials")
      .populate("complaint", "complaintId title hostel block roomNumber")
      .populate("assignedTechnician", "name phone technicianId")
      .populate("receivedByTechnician", "name phone technicianId")
      .populate("issuedBy", "name")
      .sort({
        createdAt: -1,
      })
      .limit(1000)
      .lean();

    const summary = {
      total: issuedItems.length,

      awaitingConfirmation: issuedItems.filter(
        (item) =>
          !item.receivingStatus ||
          item.receivingStatus === "AWAITING_CONFIRMATION",
      ).length,

      confirmed: issuedItems.filter(
        (item) => item.receivingStatus === "CONFIRMED",
      ).length,

      disputed: issuedItems.filter(
        (item) => item.receivingStatus === "DISPUTED",
      ).length,

      resolved: issuedItems.filter(
        (item) => item.receivingStatus === "RESOLVED",
      ).length,
    };

    return res.status(200).json({
      success: true,
      count: issuedItems.length,
      summary,
      issuedItems,
    });
  } catch (error) {
    return respondError(res, error);
  }
};

// ==========================================
// DELIVERED STATUS
// PUT /api/store/issued-items/deliver/:id
// ==========================================

exports.markDelivered = async (req, res) => {
  try {
    const issued = await IssuedItem.findOneAndUpdate(
      {
        _id: req.params.id,
        status: "Issued",
      },
      {
        $set: {
          status: "Delivered",
          deliveredAt: new Date(),
        },
      },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!issued) {
      return res.status(409).json({
        success: false,
        message: "Issued item not found or already delivered.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Material delivery confirmed.",
      issuedItem: issued,
    });
  } catch (error) {
    return respondError(res, error);
  }
};

// ==========================================
// LEGACY EXPORTS
// ==========================================

exports.createIssuedItem = exports.issueItem;
exports.getAllIssuedItems = exports.getIssuedItems;
exports.updateIssuedItemStatus = exports.markDelivered;
exports.updateDeliveryStatus = exports.markDelivered;
