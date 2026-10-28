const mongoose = require("mongoose");

const Inventory = require("../../models/Inventory");
const MaterialRequest = require("../../models/MaterialRequest");
const IssuedItem = require("../../models/IssuedItem");
const StockTransaction = require("../../models/StockTransaction");

const clean = (value) => String(value ?? "").trim();

const round = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

const validQty = (n) =>
  Number.isFinite(n) &&
  n > 0 &&
  Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-7;

function fail(message, status = 400) {
  const error = new Error(message);
  error.statusCode = status;
  throw error;
}

function stockStatus(quantity, minimum) {
  if (quantity <= 0) return "Out Of Stock";
  if (quantity <= minimum) return "Low Stock";
  return "Available";
}

function requestStatus(materials) {
  const statuses = materials.map((m) => m.status);
  const totalIssued = materials.reduce(
    (sum, m) => sum + Number(m.issuedQuantity || 0),
    0,
  );

  const anyPending = statuses.includes("PENDING");
  const anyApproved = statuses.some((s) =>
    ["APPROVED", "PARTIALLY_ISSUED"].includes(s),
  );

  const allIssued = statuses.every((s) => s === "ISSUED");

  if (allIssued) return "ISSUED";

  if (totalIssued > 0) return "PARTIALLY_ISSUED";

  if (anyApproved && anyPending) return "PARTIALLY_APPROVED";

  if (anyApproved) return "APPROVED_BY_STORE";

  if (statuses.every((s) => s === "REJECTED")) {
    return "REJECTED";
  }

  if (statuses.every((s) => ["OUT_OF_STOCK", "REJECTED"].includes(s))) {
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
      message: "Duplicate issue transaction detected.",
    });
  }

  if (/WriteConflict|TransientTransactionError/i.test(error.message || "")) {
    return res.status(409).json({
      success: false,
      message: "Stock was updated concurrently. Refresh and retry.",
    });
  }

  return res.status(500).json({
    success: false,
    message: "Material issue failed.",
  });
}

function issueVoucherNumber() {
  return `AMI-IV-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

// ==========================================
// POST /api/store/issued-items/issue
// ==========================================

exports.issueItem = async (req, res) => {
  const materialRequestId = clean(
    req.body.materialRequestId || req.body.requestId,
  );

  const materialItemId = clean(req.body.materialItemId);
  const quantity = Number(req.body.quantity);

  const receiverName = clean(req.body.receiverName || req.body.issuedTo);

  const technicianId = clean(req.body.technicianId);
  const remarks = clean(req.body.remarks);

  const retrievalRequired = req.body.retrievalRequired === true;

  const expectedRetrievalQty = retrievalRequired
    ? Number(req.body.expectedRetrievalQty ?? quantity)
    : 0;

  if (
    !mongoose.isValidObjectId(materialRequestId) ||
    !mongoose.isValidObjectId(materialItemId)
  ) {
    return res.status(400).json({
      success: false,
      message: "Valid request and material IDs are required.",
    });
  }

  if (!validQty(quantity)) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid issue quantity.",
    });
  }

  if (!receiverName) {
    return res.status(400).json({
      success: false,
      message: "Receiver name is required.",
    });
  }

  if (
    retrievalRequired &&
    (!validQty(expectedRetrievalQty) || expectedRetrievalQty > quantity)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid expected retrieval quantity.",
    });
  }

  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
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
        fail("This material must be approved before issue.", 409);
      }

      const approved = Number(material.approvedQuantity || 0);
      const alreadyIssued = Number(material.issuedQuantity || 0);
      const remaining = round(approved - alreadyIssued);

      if (remaining <= 0) {
        fail("Approved quantity has already been issued.", 409);
      }

      if (quantity > remaining) {
        fail(`Only ${remaining} approved units are available to issue.`, 409);
      }

      // Match inventory by item name because the current
      // MaterialRequest schema stores itemName, not itemCode.
      const matching = await Inventory.find({
        itemName: material.itemName,
        isActive: { $ne: false },
      })
        .collation({ locale: "en", strength: 2 })
        .session(session);

      if (matching.length === 0) {
        fail(`Inventory item "${material.itemName}" was not found.`, 404);
      }

      if (matching.length > 1) {
        fail(
          "Multiple inventory items match this material. Item Code mapping is required.",
          409,
        );
      }

      const inventory = matching[0];

      if (
        clean(inventory.unit).toLowerCase() !==
        clean(material.unit).toLowerCase()
      ) {
        fail(
          `UOM mismatch: request uses ${material.unit}, inventory uses ${inventory.unit}.`,
          409,
        );
      }

      const before = Number(inventory.currentStock || 0);

      if (before < quantity) {
        fail(
          `Insufficient stock for ${material.itemName}. Available: ${before}.`,
          409,
        );
      }

      const updated = await Inventory.findOneAndUpdate(
        {
          _id: inventory._id,
          isActive: { $ne: false },
          currentStock: { $gte: quantity },
        },
        {
          $inc: {
            currentStock: -quantity,
            outgoingQuantity: quantity,
          },
        },
        {
          session,
          new: true,
          runValidators: true,
        },
      );

      if (!updated) {
        fail("Insufficient stock or concurrent inventory update.", 409);
      }

      const after = Number(updated.currentStock);

      await Inventory.updateOne(
        { _id: updated._id },
        {
          $set: {
            status: stockStatus(after, Number(updated.minimumStock || 0)),
          },
        },
        { session },
      );

      material.issuedQuantity = round(alreadyIssued + quantity);
      material.status =
        material.issuedQuantity >= approved ? "ISSUED" : "PARTIALLY_ISSUED";

      request.status = requestStatus(request.materials);

      if (!request.issuedBy) {
        request.issuedBy = req.user._id;
      }

      request.issuedAt = new Date();

      const voucherNo = issueVoucherNumber();

      if (!request.storeSlipNo) {
        request.storeSlipNo = voucherNo;
      }

      await request.save({ session });

      const complaintId = request.complaint || null;
      const jobCardId = request.jobCard || null;

      const [issued] = await IssuedItem.create(
        [
          {
            materialRequest: request._id,
            materialItemId: material._id,
            complaint: complaintId,
            jobCard: jobCardId,
            inventoryItem: inventory._id,
            itemCode: inventory.itemCode || "",
            item: inventory.itemName,
            unit: inventory.unit,
            quantity,
            issuedTo: receiverName,
            assignedTechnician: request.assignedWorker || null,
            technicianId,
            receiverTechnicianId: technicianId,
            voucherNo,
            storeSlipNo: voucherNo,
            issuedBy: req.user._id,
            issuedDate: new Date(),
            status: "Issued",
            remarks,
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
            remarks: `Complaint material issue. Request: ${request.requestId || request._id}. ${remarks}`,
          },
        ],
        { session },
      );

      result = {
        issuedItem: issued,
        voucherNo,
        stockBefore: before,
        stockAfter: after,
        requestStatus: request.status,
        remainingApprovedQuantity: round(approved - material.issuedQuantity),
      };
    });

    return res.status(201).json({
      success: true,
      message: "Material issued and inventory updated successfully.",
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
      .populate("issuedBy", "name")
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean();

    return res.json({
      success: true,
      count: issuedItems.length,
      issuedItems,
    });
  } catch (error) {
    return respondError(res, error);
  }
};

// ==========================================
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
      { new: true, runValidators: true },
    );

    if (!issued) {
      return res.status(409).json({
        success: false,
        message: "Issued item not found or already delivered.",
      });
    }

    return res.json({
      success: true,
      message: "Material delivery confirmed.",
      issuedItem: issued,
    });
  } catch (error) {
    return respondError(res, error);
  }
};

// Existing route/controller export compatibility.
exports.createIssuedItem = exports.issueItem;
exports.getAllIssuedItems = exports.getIssuedItems;
exports.updateIssuedItemStatus = exports.markDelivered;
exports.updateDeliveryStatus = exports.markDelivered;
