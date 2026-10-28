const mongoose = require("mongoose");

const IssuedItem = require("../../models/IssuedItem");
const MaterialReceiving = require("../../models/MaterialReceiving");

// ==========================================
// HELPERS
// ==========================================

const round = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;

const validQuantity = (value) =>
  Number.isFinite(value) &&
  value >= 0 &&
  Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7;

const getId = (value) => {
  if (!value) return "";
  return String(value._id || value);
};

const getReceiverId = (issued) => {
  // New records: actual verified receiver.
  // Legacy records: assigned Technician fallback.
  return issued.receivedByTechnician || issued.assignedTechnician || null;
};

const canReceive = (issued, userId) => {
  const receiverId = getReceiverId(issued);

  return Boolean(receiverId) && getId(receiverId) === getId(userId);
};

const sendError = (res, error) => {
  console.error("MATERIAL RECEIVING ERROR:", error);

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "Material receiving already confirmed.",
    });
  }

  if (
    error.code === 112 ||
    error.hasErrorLabel?.("TransientTransactionError")
  ) {
    return res.status(409).json({
      success: false,
      message: "Material record was updated concurrently. Refresh and retry.",
    });
  }

  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.statusCode
      ? error.message
      : "Material receiving operation failed.",
  });
};

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

// ==========================================
// TECHNICIAN - MY MATERIALS
// GET /api/store/material-receiving/my-materials
// ==========================================

exports.getMyMaterials = async (req, res) => {
  try {
    const technicianId = req.user?._id;

    if (!technicianId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const issuedItems = await IssuedItem.find({
      materialRequest: { $ne: null },
      isActive: { $ne: false },

      $or: [
        {
          receivedByTechnician: technicianId,
        },
        {
          receivedByTechnician: null,
          assignedTechnician: technicianId,
        },
      ],
    })
      .populate("materialRequest", "requestId status")
      .populate("complaint", "complaintId title hostel block roomNumber")
      .populate("assignedTechnician", "name technicianId")
      .populate("receivedByTechnician", "name technicianId")
      .sort({ issuedDate: -1 })
      .limit(1000)
      .lean();

    const ids = issuedItems.map((item) => item._id);

    const confirmations = ids.length
      ? await MaterialReceiving.find({
          issuedItem: { $in: ids },
        }).lean()
      : [];

    const confirmationMap = new Map(
      confirmations.map((record) => [getId(record.issuedItem), record]),
    );

    const items = issuedItems.map((item) => ({
      ...item,
      receiving:
        confirmationMap.get(getId(item._id)) ||
        (item.receivingStatus &&
        item.receivingStatus !== "AWAITING_CONFIRMATION"
          ? {
              status: item.receivingStatus,
              receivedQuantity: item.receivedQuantity || 0,
              shortageQuantity: item.shortageQuantity || 0,
              technicianRemarks: item.receivingRemarks || "",
              confirmedAt: item.receivingConfirmedAt || null,
            }
          : null),
    }));

    const summary = {
      total: items.length,

      awaitingConfirmation: items.filter((item) => !item.receiving).length,

      confirmed: items.filter((item) => item.receiving?.status === "CONFIRMED")
        .length,

      disputed: items.filter((item) => item.receiving?.status === "DISPUTED")
        .length,

      resolved: items.filter((item) => item.receiving?.status === "RESOLVED")
        .length,
    };

    return res.status(200).json({
      success: true,
      summary,
      items,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

// ==========================================
// STORE MANAGER - RECEIVING AUDIT
// GET /api/store/material-receiving/all
// ==========================================

exports.getAllReceiving = async (req, res) => {
  try {
    const records = await MaterialReceiving.find()
      .populate("technician", "name email technicianId phone")
      .populate({
        path: "issuedItem",
        select:
          "item itemCode unit quantity voucherNo storeSlipNo issuedTo issuedDate status receivingStatus receivedByTechnician assignedTechnician materialRequest complaint",
        populate: [
          {
            path: "materialRequest",
            select: "requestId status",
          },
          {
            path: "complaint",
            select: "complaintId title hostel block roomNumber",
          },
        ],
      })
      .sort({ confirmedAt: -1 })
      .limit(1000)
      .lean();

    const summary = {
      total: records.length,
      confirmed: records.filter((item) => item.status === "CONFIRMED").length,
      disputed: records.filter((item) => item.status === "DISPUTED").length,
      resolved: records.filter((item) => item.status === "RESOLVED").length,
    };

    return res.status(200).json({
      success: true,
      summary,
      records,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

// ==========================================
// TECHNICIAN - CONFIRM RECEIVING
// POST /api/store/material-receiving/confirm
// ==========================================

exports.confirmReceiving = async (req, res) => {
  const technicianUserId = req.user?._id;

  if (!technicianUserId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  const issuedItemId = String(req.body?.issuedItemId || "").trim();

  if (!mongoose.isValidObjectId(issuedItemId)) {
    return res.status(400).json({
      success: false,
      message: "Valid issued item ID is required.",
    });
  }

  // Don't allow Number("") to turn an empty input
  // into a valid zero quantity.
  const rawQuantity = req.body?.receivedQuantity;

  if (
    rawQuantity === undefined ||
    rawQuantity === null ||
    String(rawQuantity).trim() === ""
  ) {
    return res.status(400).json({
      success: false,
      message: "Received quantity is required.",
    });
  }

  const receivedQuantity = Number(rawQuantity);

  const technicianRemarks = String(req.body?.technicianRemarks || "").trim();

  if (!validQuantity(receivedQuantity)) {
    return res.status(400).json({
      success: false,
      message: "Received quantity must be a valid non-negative number.",
    });
  }

  const session = await mongoose.startSession();

  try {
    let result = null;

    await session.withTransaction(async () => {
      // Read inside the same transaction.
      const issued = await IssuedItem.findById(issuedItemId).session(session);

      if (!issued) {
        fail("Issued material not found.", 404);
      }

      if (issued.isActive === false) {
        fail("This issue record is inactive.", 409);
      }

      if (!issued.materialRequest) {
        fail(
          "Receiving confirmation is not enabled for this legacy issue.",
          409,
        );
      }

      // Actual receiver gets priority over assigned worker.
      if (!canReceive(issued, technicianUserId)) {
        fail(
          "You are not the authorized receiving Technician for this material.",
          403,
        );
      }

      if (!["Issued", "Delivered"].includes(issued.status)) {
        fail("Material is not ready for receiving confirmation.", 409);
      }

      if (
        issued.receivingStatus &&
        issued.receivingStatus !== "AWAITING_CONFIRMATION"
      ) {
        fail("Receiving has already been confirmed for this item.", 409);
      }

      const issuedQuantity = round(Number(issued.quantity));

      if (!Number.isFinite(issuedQuantity) || issuedQuantity <= 0) {
        fail("Invalid issued quantity.", 409);
      }

      if (receivedQuantity > issuedQuantity) {
        fail(
          `Received quantity cannot exceed issued quantity (${issuedQuantity}).`,
          400,
        );
      }

      const shortageQuantity = round(issuedQuantity - receivedQuantity);

      if (shortageQuantity > 0 && !technicianRemarks) {
        fail("Please enter a reason for the quantity difference.", 400);
      }

      const existing = await MaterialReceiving.exists({
        issuedItem: issued._id,
      }).session(session);

      if (existing) {
        fail("This issue already has a receiving confirmation.", 409);
      }

      const receivingStatus = shortageQuantity > 0 ? "DISPUTED" : "CONFIRMED";

      const confirmedAt = new Date();

      // Update the issue record only if still awaiting.
      // Also protects legacy documents where the
      // receivingStatus field has not been initialized.
      const updatedIssue = await IssuedItem.findOneAndUpdate(
        {
          _id: issued._id,
          isActive: { $ne: false },
          $or: [
            {
              receivingStatus: "AWAITING_CONFIRMATION",
            },
            {
              receivingStatus: {
                $exists: false,
              },
            },
            {
              receivingStatus: null,
            },
          ],
        },
        {
          $set: {
            receivingStatus,
            receivedQuantity,
            shortageQuantity,
            receivingConfirmedAt: confirmedAt,
            receivingRemarks: technicianRemarks,
          },
        },
        {
          new: true,
          runValidators: true,
          session,
        },
      );

      if (!updatedIssue) {
        fail(
          "Receiving was already confirmed or updated. Refresh the page.",
          409,
        );
      }

      const [receiving] = await MaterialReceiving.create(
        [
          {
            issuedItem: issued._id,
            technician: technicianUserId,
            issuedQuantity,
            receivedQuantity,
            shortageQuantity,
            status: receivingStatus,
            technicianRemarks,
            confirmedAt,
          },
        ],
        { session },
      );

      result = {
        receiving,
        issuedItemId: issued._id,
        voucherNo: issued.voucherNo || "",
        issuedQuantity,
        receivedQuantity,
        shortageQuantity,
        receivingStatus,
      };
    });

    return res.status(201).json({
      success: true,
      message:
        result.receivingStatus === "DISPUTED"
          ? "Quantity discrepancy recorded. Store Manager review required."
          : "Material receiving confirmed successfully.",
      ...result,
    });
  } catch (error) {
    return sendError(res, error);
  } finally {
    await session.endSession();
  }
};
