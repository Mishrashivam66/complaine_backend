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

// ==========================================
// UOM NORMALIZATION
// FIX: PIECE / PCS / NOS ARE EQUIVALENT
// ==========================================

const normalizeUnit = (value) => {
  const unit = clean(value)
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, "");

  if (!unit) return "";

  const equivalentUnits = {
    // Number of pieces
    piece: "PCS",
    pieces: "PCS",
    pcs: "PCS",
    pc: "PCS",
    nos: "PCS",
    no: "PCS",
    number: "PCS",
    numbers: "PCS",
    each: "PCS",
    unit: "PCS",
    units: "PCS",

    // Weight
    kg: "KG",
    kilogram: "KG",
    kilograms: "KG",

    gram: "G",
    grams: "G",
    gm: "G",
    g: "G",

    // Length
    meter: "M",
    meters: "M",
    metre: "M",
    metres: "M",
    mtr: "M",
    mtrs: "M",
    m: "M",

    // Liquid volume
    litre: "L",
    litres: "L",
    liter: "L",
    liters: "L",
    ltr: "L",
    ltrs: "L",
    l: "L",

    // Packaging
    box: "BOX",
    boxes: "BOX",

    roll: "ROLL",
    rolls: "ROLL",

    packet: "PACKET",
    packets: "PACKET",
    pkt: "PACKET",
    pkts: "PACKET",

    set: "SET",
    sets: "SET",

    pair: "PAIR",
    pairs: "PAIR",

    bundle: "BUNDLE",
    bundles: "BUNDLE",

    dozen: "DOZEN",
    dz: "DOZEN",
  };

  return equivalentUnits[unit] || unit.toUpperCase();
};

// ==========================================
// ERROR HELPER
// ==========================================

function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

// ==========================================
// INVENTORY STOCK STATUS
// ==========================================

function stockStatus(quantity, minimum) {
  if (quantity <= 0) {
    return "Out Of Stock";
  }

  if (quantity <= minimum) {
    return "Low Stock";
  }

  return "Available";
}

// ==========================================
// ISSUE VOUCHER NUMBER
// ==========================================

function issueVoucherNumber() {
  return (
    `AMI-IV-${Date.now()}-` +
    Math.random().toString(36).slice(2, 8).toUpperCase()
  );
}

// ==========================================
// MATERIAL REQUEST STATUS
// ==========================================

function requestStatus(materials) {
  const statuses = materials.map((material) => material.status);

  if (!statuses.length) {
    return "PENDING";
  }

  const totalIssued = materials.reduce(
    (sum, material) => sum + Number(material.issuedQuantity || 0),
    0,
  );

  const anyPending = statuses.includes("PENDING");

  const anyApproved = statuses.some((status) =>
    ["APPROVED", "PARTIALLY_ISSUED"].includes(status),
  );

  const allIssued = statuses.every((status) => status === "ISSUED");

  if (allIssued) {
    return "ISSUED";
  }

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

// ==========================================
// ERROR RESPONSE
// ==========================================

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
// VERIFY RECEIVING TECHNICIAN
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

  // If no receiverUserId is provided,
  // use the assigned Technician.
  // Never identify a Technician by typed name.

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

  // Ensure the submitted name matches the
  // verified Technician account.

  if (
    receiverName &&
    receiverName.toLowerCase() !== verifiedName.toLowerCase()
  ) {
    fail("Receiver name does not match the selected Technician account.", 409);
  }

  // Validate Technician ID when available.

  if (
    technicianId &&
    verifiedTechnicianId &&
    technicianId.toUpperCase() !== verifiedTechnicianId.toUpperCase()
  ) {
    fail("Technician ID does not match the selected Technician account.", 409);
  }

  return {
    userId: technician._id,
    name: verifiedName,
    technicianId: verifiedTechnicianId,
  };
}

// ==========================================
// ISSUE MATERIAL
// POST /api/store/issued-items/issue
// ==========================================

exports.issueItem = async (req, res) => {
  const materialRequestId = clean(
    req.body?.materialRequestId || req.body?.requestId,
  );

  const materialItemId = clean(req.body?.materialItemId);

  const rawQuantity = req.body?.quantity;
  const quantity = Number(rawQuantity);

  const receiverUserId = clean(req.body?.receiverUserId);

  const receiverName = clean(req.body?.receiverName || req.body?.issuedTo);

  const technicianId = clean(req.body?.technicianId);

  const remarks = clean(req.body?.remarks);

  const retrievalRequired = req.body?.retrievalRequired === true;

  const expectedRetrievalQty = retrievalRequired
    ? Number(req.body?.expectedRetrievalQty ?? quantity)
    : 0;

  // ========================================
  // AUTHENTICATION
  // ========================================

  if (!req.user?._id) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  // ========================================
  // REQUEST VALIDATION
  // ========================================

  if (
    !mongoose.isValidObjectId(materialRequestId) ||
    !mongoose.isValidObjectId(materialItemId)
  ) {
    return res.status(400).json({
      success: false,
      message: "Valid material request and item IDs are required.",
    });
  }

  if (
    rawQuantity === undefined ||
    rawQuantity === null ||
    String(rawQuantity).trim() === "" ||
    !validQty(quantity)
  ) {
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

  // ========================================
  // DATABASE TRANSACTION
  // ========================================

  const session = await mongoose.startSession();

  try {
    let result = null;

    await session.withTransaction(async () => {
      // ====================================
      // FETCH MATERIAL REQUEST
      // ====================================

      const request =
        await MaterialRequest.findById(materialRequestId).session(session);

      if (!request) {
        fail("Material request not found.", 404);
      }

      const material = request.materials.id(materialItemId);

      if (!material) {
        fail("Requested material not found.", 404);
      }

      // ====================================
      // CHECK APPROVAL STATUS
      // ====================================

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

      // ====================================
      // VERIFY TECHNICIAN
      // ====================================

      const assignedWorkerId = getId(request.assignedWorker);

      const receiver = await resolveReceiver({
        receiverUserId,
        assignedWorkerId,
        receiverName,
        technicianId,
        session,
      });

      // ====================================
      // INVENTORY MATCH
      // ====================================

      // Prefer exact Item Code when the
      // material request contains one.
      // Otherwise match by item name and
      // reject ambiguous results.

      const requestItemCode = clean(material.itemCode).toUpperCase();

      let matching;

      if (requestItemCode) {
        matching = await Inventory.find({
          itemCode: requestItemCode,
          isActive: { $ne: false },
        }).session(session);
      } else {
        matching = await Inventory.find({
          itemName: material.itemName,
          isActive: { $ne: false },
        })
          .collation({
            locale: "en",
            strength: 2,
          })
          .session(session);
      }

      if (!matching.length) {
        fail(`Inventory item "${material.itemName}" not found.`, 404);
      }

      if (matching.length > 1) {
        fail(
          "Multiple inventory records match this material. Exact Item Code mapping is required.",
          409,
        );
      }

      const inventory = matching[0];

      console.log("ISSUE INVENTORY DEBUG:", {
        database: mongoose.connection.name,
        itemName: inventory.itemName,
        itemCode: inventory.itemCode || "MISSING",
        inventoryId: String(inventory._id),
        currentStock: inventory.currentStock,
      });
      const inventoryItemCode = clean(inventory.itemCode).toUpperCase();

      if (!inventoryItemCode) {
        fail(
          `Inventory item "${inventory.itemName}" has no Item Code. ` +
            "Assign a valid unique Item Code before issuing material.",
          409,
        );
      }
      // ====================================
      // FIXED: UOM NORMALIZATION
      // ====================================

      const requestedUnit = normalizeUnit(material.unit);

      const inventoryUnit = normalizeUnit(inventory.unit);

      if (!requestedUnit || !inventoryUnit || requestedUnit !== inventoryUnit) {
        fail(
          `UOM mismatch. Request: ${material.unit}, Inventory: ${inventory.unit}.`,
          409,
        );
      }

      // PIECE = PCS = NOS.
      // Different units such as KG and PCS
      // remain incompatible.

      // ====================================
      // INVENTORY STOCK CHECK
      // ====================================

      const before = round(inventory.currentStock || 0);

      if (before < quantity) {
        fail(
          `Insufficient stock. Available: ${before} ${inventory.unit}.`,
          409,
        );
      }

      // ====================================
      // ATOMIC STOCK DEDUCTION
      // ====================================

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

      // ====================================
      // UPDATE STOCK STATUS
      // ====================================

      await Inventory.updateOne(
        {
          _id: updatedInventory._id,
        },
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

      // ====================================
      // UPDATE MATERIAL REQUEST
      // ====================================

      material.issuedQuantity = round(alreadyIssued + quantity);

      material.status =
        material.issuedQuantity >= approved ? "ISSUED" : "PARTIALLY_ISSUED";

      request.status = requestStatus(request.materials);

      if (!request.issuedBy) {
        request.issuedBy = req.user._id;
      }

      request.issuedAt = new Date();

      // ====================================
      // GENERATE ISSUE VOUCHER
      // ====================================

      const voucherNo = issueVoucherNumber();

      if (!request.storeSlipNo) {
        request.storeSlipNo = voucherNo;
      }

      await request.save({ session });

      // ====================================
      // CREATE ISSUED ITEM RECORD
      // ====================================

      const [issuedItem] = await IssuedItem.create(
        [
          {
            materialRequest: request._id,

            materialItemId: material._id,

            complaint: request.complaint || null,

            jobCard: request.jobCard || null,

            inventoryItem: inventory._id,

            itemCode: inventoryItemCode,

            item: inventory.itemName,

            // Save actual inventory UOM
            unit: inventory.unit,

            quantity,

            hostel: request.hostel || "",

            block: request.block || "",

            // Verified receiver
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

            // Technician confirmation
            receivingStatus: "AWAITING_CONFIRMATION",

            receivedQuantity: 0,

            shortageQuantity: 0,

            receivingConfirmedAt: null,

            receivingRemarks: "",

            // Old material retrieval
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

      // ====================================
      // STOCK TRANSACTION HISTORY
      // ====================================

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

      // ====================================
      // FINAL RESPONSE
      // ====================================

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
// GET ALL ISSUED ITEMS
// GET /api/store/issued-items/all
// ==========================================

exports.getIssuedItems = async (req, res) => {
  try {
    const issuedItems = await IssuedItem.find()
      .populate("materialRequest", "requestId status materials")
      .populate("complaint", "complaintId title hostel block roomNumber")
      .populate(
        "assignedTechnician",
        "name phone technicianId workerId employeeId",
      )
      .populate(
        "receivedByTechnician",
        "name phone technicianId workerId employeeId",
      )
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
// MARK DELIVERED
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
// LEGACY EXPORT COMPATIBILITY
// ==========================================

exports.createIssuedItem = exports.issueItem;

exports.getAllIssuedItems = exports.getIssuedItems;

exports.updateIssuedItemStatus = exports.markDelivered;

exports.updateDeliveryStatus = exports.markDelivered;
