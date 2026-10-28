const mongoose = require("mongoose");

const IssuedItem = require("../../models/IssuedItem");
const RetrievedItem = require("../../models/RetrievedItem");

const round = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

const clean = (value) => String(value ?? "").trim();

function sendError(res, error) {
  console.error("RETRIEVED ITEM ERROR:", error);

  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.statusCode
      ? error.message
      : "Retrieved item operation failed.",
  });
}

function reject(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

// ==========================================
// GET /api/store/retrieved-items/all
// ==========================================

exports.getAll = async (req, res) => {
  try {
    const [issuedItems, retrievedItems] = await Promise.all([
      IssuedItem.find({
        retrievalRequired: true,
      })
        .populate("materialRequest", "requestId status")
        .populate("complaint", "complaintId title hostel block")
        .populate("assignedTechnician", "name technicianId phone")
        .sort({ issuedDate: -1 })
        .lean(),

      RetrievedItem.find()
        .populate("receivedBy", "name")
        .sort({ receivedAt: -1 })
        .limit(1000)
        .lean(),
    ]);

    return res.json({
      success: true,
      issuedItems,
      retrievedItems,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

// ==========================================
// POST /api/store/retrieved-items/receive
// ==========================================

exports.receive = async (req, res) => {
  const issuedItemId = clean(req.body.issuedItemId);
  const quantity = Number(req.body.quantity);
  const condition = clean(req.body.condition) || "DAMAGED";
  const remarks = clean(req.body.remarks);

  const conditions = [
    "DAMAGED",
    "BROKEN",
    "FAULTY",
    "USED",
    "REPAIRABLE",
    "SCRAP",
  ];

  if (!mongoose.isValidObjectId(issuedItemId)) {
    return res.status(400).json({
      success: false,
      message: "Valid issued item is required.",
    });
  }

  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 1e-7
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid retrieved quantity.",
    });
  }

  if (!conditions.includes(condition)) {
    return res.status(400).json({
      success: false,
      message: "Invalid retrieved item condition.",
    });
  }

  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const issued = await IssuedItem.findById(issuedItemId).session(session);

      if (!issued) {
        reject("Issued item not found.", 404);
      }

      if (!issued.retrievalRequired) {
        reject("Retrieval is not required for this item.", 409);
      }

      const expected = Number(issued.expectedRetrievalQty || 0);

      const received = Number(issued.retrievedQuantity || 0);

      const pending = round(expected - received);

      if (pending <= 0) {
        reject("All expected retrieved materials have been received.", 409);
      }

      if (quantity > pending) {
        reject(`Only ${pending} units are pending retrieval.`, 409);
      }

      const [record] = await RetrievedItem.create(
        [
          {
            issuedItem: issued._id,
            materialRequest: issued.materialRequest || null,
            complaint: issued.complaint || null,
            jobCard: issued.jobCard || null,
            itemCode: issued.itemCode || "",
            itemName: issued.item,
            unit: issued.unit || "Piece",
            quantity,
            condition,
            receivedFrom: clean(req.body.receivedFrom) || issued.issuedTo,
            technicianId: issued.technicianId || "",
            receivedBy: req.user._id,
            receivedAt: new Date(),
            remarks,
          },
        ],
        { session },
      );

      issued.retrievedQuantity = round(received + quantity);

      issued.retrievalStatus =
        issued.retrievedQuantity >= expected
          ? "RETRIEVED"
          : "PARTIALLY_RETRIEVED";

      issued.lastRetrievedAt = new Date();

      await issued.save({ session });

      result = {
        retrievedItem: record,
        receivedQuantity: issued.retrievedQuantity,
        pendingQuantity: round(expected - issued.retrievedQuantity),
        retrievalStatus: issued.retrievalStatus,
      };
    });

    return res.status(201).json({
      success: true,
      message: "Retrieved material received successfully.",
      ...result,
    });
  } catch (error) {
    return sendError(res, error);
  } finally {
    await session.endSession();
  }
};
