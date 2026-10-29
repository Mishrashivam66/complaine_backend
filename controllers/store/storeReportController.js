"use strict";

const mongoose = require("mongoose");

const StockTransaction = require("../../models/StockTransaction");
const StockInward = require("../../models/StockInward");
const IssuedItem = require("../../models/IssuedItem");
const MaterialReceiving = require("../../models/MaterialReceiving");
const RetrievedItem = require("../../models/RetrievedItem");

// ==========================================
// DATE AND RESPONSE HELPERS
// ==========================================

const IST_OFFSET = "+05:30";
const MAX_RANGE_DAYS = 366;

const trim = (value) => String(value ?? "").trim();

const todayIST = () => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
};

const isDateString = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const parseDay = (value) => {
  if (!isDateString(value)) {
    throw Object.assign(new Error("Invalid date. Use YYYY-MM-DD."), {
      statusCode: 400,
    });
  }

  const date = new Date(`${value}T00:00:00${IST_OFFSET}`);

  if (
    Number.isNaN(date.getTime()) ||
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date) !== value
  ) {
    throw Object.assign(new Error("Invalid calendar date."), {
      statusCode: 400,
    });
  }

  return date;
};

const getRange = (req) => {
  const defaultDate = todayIST();

  const fromText = trim(req.query.from) || defaultDate;
  const toText = trim(req.query.to) || fromText;

  const start = parseDay(fromText);
  const toStart = parseDay(toText);

  if (start.getTime() > toStart.getTime()) {
    throw Object.assign(new Error("From date cannot be after To date."), {
      statusCode: 400,
    });
  }

  const rangeDays = (toStart.getTime() - start.getTime()) / 86400000;

  if (rangeDays > MAX_RANGE_DAYS) {
    throw Object.assign(new Error("Maximum report range is 366 days."), {
      statusCode: 400,
    });
  }

  const endExclusive = new Date(toStart.getTime() + 86400000);

  return {
    from: fromText,
    to: toText,
    start,
    endExclusive,
  };
};

const dateFilter = (field, range) => ({
  [field]: {
    $gte: range.start,
    $lt: range.endExclusive,
  },
});

const maxRows = (req) => {
  const parsed = Number(req.query.limit);
  if (!Number.isFinite(parsed)) return 200;

  return Math.min(500, Math.max(1, Math.floor(parsed)));
};

const respondError = (res, error) => {
  console.error("STORE REPORT ERROR:", error);

  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.statusCode
      ? error.message
      : "Unable to generate store report.",
  });
};

const sendList = (res, range, key, records, total) =>
  res.status(200).json({
    success: true,
    from: range.from,
    to: range.to,
    count: records.length,
    total,
    limited: records.length < total,
    [key]: records,
  });

// ==========================================
// UOM-WISE QUANTITY SUMMARY
// ==========================================

// Never combine kg, metres, pieces, etc.
// into a single misleading quantity.

const summarizeByUnit = (records, getQuantity, getUnit) => {
  const totals = new Map();

  for (const record of records) {
    const unit = trim(getUnit(record)) || "Piece";
    const quantity = Number(getQuantity(record) || 0);

    if (!Number.isFinite(quantity)) continue;

    const key = unit.toUpperCase();

    const previous = totals.get(key) || {
      unit,
      quantity: 0,
    };

    previous.quantity =
      Math.round((previous.quantity + quantity + Number.EPSILON) * 1000) / 1000;

    totals.set(key, previous);
  }

  return Array.from(totals.values());
};

// ==========================================
// DAILY / DATE-WISE SUMMARY
// GET /api/store/reports/summary
// ==========================================

exports.getDailySummary = async (req, res) => {
  try {
    const range = getRange(req);

    const [transactions, inward, issues, receiving, retrieved] =
      await Promise.all([
        StockTransaction.find(dateFilter("transactionDate", range))
          .select("type quantity unit")
          .lean(),

        StockInward.find(dateFilter("receiptDate", range))
          .select("items inwardNo")
          .lean(),

        IssuedItem.find(dateFilter("issuedDate", range))
          .select("quantity unit receivingStatus")
          .lean(),

        MaterialReceiving.find(dateFilter("confirmedAt", range))
          .select("receivedQuantity shortageQuantity status")
          .lean(),

        RetrievedItem.find(dateFilter("receivedAt", range))
          .select("quantity unit condition")
          .lean(),
      ]);

    const inwardTransactions = transactions.filter(
      (item) => item.type === "INWARD",
    );

    const issueTransactions = transactions.filter(
      (item) => item.type === "ISSUE",
    );

    const returnTransactions = transactions.filter(
      (item) => item.type === "RETURN",
    );

    const adjustmentTransactions = transactions.filter(
      (item) => item.type === "ADJUSTMENT_IN" || item.type === "ADJUSTMENT_OUT",
    );

    return res.status(200).json({
      success: true,
      from: range.from,
      to: range.to,

      summary: {
        stockInwardEntries: inward.length,
        materialIssueEntries: issues.length,
        technicianReceivingEntries: receiving.length,
        retrievedEntries: retrieved.length,

        inwardTransactions: inwardTransactions.length,
        issueTransactions: issueTransactions.length,
        returnTransactions: returnTransactions.length,
        adjustmentTransactions: adjustmentTransactions.length,

        disputedReceiving: receiving.filter(
          (item) => item.status === "DISPUTED",
        ).length,

        issuedAwaitingConfirmation: issues.filter(
          (item) => item.receivingStatus === "AWAITING_CONFIRMATION",
        ).length,

        inwardByUnit: summarizeByUnit(
          inwardTransactions,
          (item) => item.quantity,
          (item) => item.unit,
        ),

        issuedByUnit: summarizeByUnit(
          issueTransactions,
          (item) => item.quantity,
          (item) => item.unit,
        ),

        returnedToUsableStockByUnit: summarizeByUnit(
          returnTransactions,
          (item) => item.quantity,
          (item) => item.unit,
        ),

        retrievedDamagedByUnit: summarizeByUnit(
          retrieved,
          (item) => item.quantity,
          (item) => item.unit,
        ),

        stockTransactionCount: transactions.length,
      },
    });
  } catch (error) {
    return respondError(res, error);
  }
};

// ==========================================
// STOCK TRANSACTION REGISTER
// GET /api/store/reports/transactions
// ==========================================

exports.getStockTransactions = async (req, res) => {
  try {
    const range = getRange(req);
    const filter = dateFilter("transactionDate", range);

    if (trim(req.query.type)) {
      const allowed = [
        "OPENING",
        "INWARD",
        "ISSUE",
        "RETURN",
        "ADJUSTMENT_IN",
        "ADJUSTMENT_OUT",
      ];

      const type = trim(req.query.type).toUpperCase();

      if (!allowed.includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid transaction type.",
        });
      }

      filter.type = type;
    }

    if (trim(req.query.itemCode)) {
      filter.itemCode = trim(req.query.itemCode).toUpperCase();
    }

    const [transactions, total] = await Promise.all([
      StockTransaction.find(filter)
        .populate("performedBy", "name role")
        .sort({
          transactionDate: -1,
          createdAt: -1,
        })
        .limit(maxRows(req))
        .lean(),

      StockTransaction.countDocuments(filter),
    ]);

    return sendList(res, range, "transactions", transactions, total);
  } catch (error) {
    return respondError(res, error);
  }
};

// ==========================================
// STOCK INWARD REGISTER
// GET /api/store/reports/inward
// ==========================================

exports.getStockInwardReport = async (req, res) => {
  try {
    const range = getRange(req);
    const filter = dateFilter("receiptDate", range);

    const [inward, total] = await Promise.all([
      StockInward.find(filter)
        .populate("createdBy", "name role")
        .sort({
          receiptDate: -1,
          createdAt: -1,
        })
        .limit(maxRows(req))
        .lean(),

      StockInward.countDocuments(filter),
    ]);

    return sendList(res, range, "inward", inward, total);
  } catch (error) {
    return respondError(res, error);
  }
};

// ==========================================
// MATERIAL ISSUE REGISTER
// GET /api/store/reports/issues
// ==========================================

exports.getMaterialIssueReport = async (req, res) => {
  try {
    const range = getRange(req);
    const filter = dateFilter("issuedDate", range);

    const [issues, total] = await Promise.all([
      IssuedItem.find(filter)
        .populate("issuedBy", "name role")
        .populate("receivedByTechnician", "name role")
        .populate("assignedTechnician", "name role")
        .sort({
          issuedDate: -1,
          createdAt: -1,
        })
        .limit(maxRows(req))
        .lean(),

      IssuedItem.countDocuments(filter),
    ]);

    return sendList(res, range, "issues", issues, total);
  } catch (error) {
    return respondError(res, error);
  }
};

// ==========================================
// TECHNICIAN RECEIVING REGISTER
// GET /api/store/reports/receiving
// ==========================================

exports.getTechnicianReceivingReport = async (req, res) => {
  try {
    const range = getRange(req);
    const filter = dateFilter("confirmedAt", range);

    const [receiving, total] = await Promise.all([
      MaterialReceiving.find(filter)
        .populate("technician", "name role")
        .populate({
          path: "issuedItem",
          select:
            "item itemCode unit quantity voucherNo storeSlipNo issuedDate issuedTo",
        })
        .sort({
          confirmedAt: -1,
          createdAt: -1,
        })
        .limit(maxRows(req))
        .lean(),

      MaterialReceiving.countDocuments(filter),
    ]);

    return sendList(res, range, "receiving", receiving, total);
  } catch (error) {
    return respondError(res, error);
  }
};

// ==========================================
// RETRIEVED MATERIAL REGISTER
// GET /api/store/reports/retrieved
// ==========================================

exports.getRetrievedMaterialsReport = async (req, res) => {
  try {
    const range = getRange(req);
    const filter = dateFilter("receivedAt", range);

    const [retrieved, total] = await Promise.all([
      RetrievedItem.find(filter)
        .populate("receivedBy", "name role")
        .populate({
          path: "issuedItem",
          select: "voucherNo storeSlipNo issuedTo issuedDate",
        })
        .sort({
          receivedAt: -1,
          createdAt: -1,
        })
        .limit(maxRows(req))
        .lean(),

      RetrievedItem.countDocuments(filter),
    ]);

    return sendList(res, range, "retrieved", retrieved, total);
  } catch (error) {
    return respondError(res, error);
  }
};

// ==========================================
// SINGLE RECEIPT DATA
// GET /api/store/reports/receipt/:type/:id
// ==========================================

exports.getReceiptDetails = async (req, res) => {
  try {
    const { type, id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid receipt record ID.",
      });
    }

    let receipt = null;
    let receiptType = "";

    if (type === "grn") {
      receipt = await StockInward.findById(id)
        .populate("createdBy", "name role")
        .lean();

      receiptType = "GOODS_RECEIPT_NOTE";
    } else if (type === "issue") {
      receipt = await IssuedItem.findById(id)
        .populate("issuedBy", "name role")
        .populate("receivedByTechnician", "name role")
        .populate("assignedTechnician", "name role")
        .lean();

      receiptType = "MATERIAL_ISSUE_VOUCHER";
    } else if (type === "receiving") {
      receipt = await MaterialReceiving.findById(id)
        .populate("technician", "name role")
        .populate("resolvedBy", "name role")
        .populate({
          path: "issuedItem",
          populate: {
            path: "issuedBy",
            select: "name role",
          },
        })
        .lean();

      receiptType = "MATERIAL_RECEIVING_ACKNOWLEDGEMENT";
    } else if (type === "retrieved") {
      receipt = await RetrievedItem.findById(id)
        .populate("receivedBy", "name role")
        .populate("issuedItem")
        .lean();

      receiptType = "RETRIEVED_MATERIAL_RECEIPT";
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid receipt type.",
      });
    }

    if (!receipt) {
      return res.status(404).json({
        success: false,
        message: "Receipt record not found.",
      });
    }

    return res.status(200).json({
      success: true,
      receiptType,
      receipt,
    });
  } catch (error) {
    return respondError(res, error);
  }
};
