"use strict";

const XLSX = require("xlsx");
const PDFDocument = require("pdfkit");

const StockTransaction = require("../../models/StockTransaction");
const StockInward = require("../../models/StockInward");
const IssuedItem = require("../../models/IssuedItem");
const MaterialReceiving = require("../../models/MaterialReceiving");
const RetrievedItem = require("../../models/RetrievedItem");

// ==========================================
// CONFIGURATION
// ==========================================

const TIMEZONE = "Asia/Kolkata";
const MAX_DAILY_ROWS = 10000;

const text = (value) => String(value ?? "").trim();

const name = (user) =>
  typeof user === "object" && user !== null ? text(user.name) : text(user);

const number = (value) => Number(value || 0);

const formatQty = (value) =>
  number(value).toLocaleString("en-IN", {
    maximumFractionDigits: 3,
  });

const display = (value) => text(value) || "-";

// ==========================================
// IST DATE HELPERS
// ==========================================

function todayIST() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());

  const get = (type) => parts.find((part) => part.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dateRange(dateString) {
  const date = text(dateString) || todayIST();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const error = new Error("Date must use YYYY-MM-DD format.");
    error.statusCode = 400;
    throw error;
  }

  const start = new Date(`${date}T00:00:00+05:30`);

  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(start);

  const get = (type) => formatted.find((part) => part.type === type)?.value;

  if (
    !Number.isFinite(start.getTime()) ||
    `${get("year")}-${get("month")}-${get("day")}` !== date
  ) {
    const error = new Error("Invalid calendar date.");
    error.statusCode = 400;
    throw error;
  }

  return {
    date,
    start,
    end: new Date(start.getTime() + 86400000),
  };
}

function dateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("en-IN", {
    timeZone: TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// ==========================================
// FETCH COMPLETE DAILY RECORDS
// ==========================================

// Every collection is checked before export.
// Do not silently cut reports at 500 rows.

async function findAll(Model, field, range, populate = []) {
  const filter = {
    [field]: {
      $gte: range.start,
      $lt: range.end,
    },
  };

  const count = await Model.countDocuments(filter);

  if (count > MAX_DAILY_ROWS) {
    const error = new Error(
      `Daily ${Model.modelName} has ${count} records, exceeding the ${MAX_DAILY_ROWS} record safety limit.`,
    );

    error.statusCode = 413;
    throw error;
  }

  let query = Model.find(filter).sort({
    [field]: 1,
    _id: 1,
  });

  for (const entry of populate) {
    query = query.populate(entry);
  }

  const records = await query.lean();

  if (records.length !== count) {
    const error = new Error(
      `${Model.modelName} data changed during report generation. Please retry.`,
    );

    error.statusCode = 409;
    throw error;
  }

  return records;
}

// ==========================================
// SUM QUANTITIES BY UOM
// ==========================================

function sumByUnit(rows, qtyField, unitField) {
  const map = new Map();

  rows.forEach((row) => {
    const unit = text(row[unitField]) || "Piece";
    const key = unit.toUpperCase();

    const current = map.get(key) || {
      unit,
      quantity: 0,
    };

    current.quantity =
      Math.round((current.quantity + number(row[qtyField])) * 1000) / 1000;

    map.set(key, current);
  });

  return [...map.values()];
}

// ==========================================
// ITEM-WISE STOCK MOVEMENT
// ==========================================

function makeMovement(transactions) {
  const byItem = new Map();

  for (const tx of transactions) {
    const id = String(tx.inventoryItem || tx.itemCode || tx.itemName);

    let movement = byItem.get(id);

    if (!movement) {
      movement = {
        itemCode: tx.itemCode,
        itemName: tx.itemName,
        unit: tx.unit,
        opening: number(tx.balanceBefore),
        inward: 0,
        issued: 0,
        returned: 0,
        adjustmentIn: 0,
        adjustmentOut: 0,
        closing: number(tx.balanceAfter),
        events: 0,
      };

      byItem.set(id, movement);
    }

    const qty = number(tx.quantity);

    if (tx.type === "INWARD") {
      movement.inward += qty;
    } else if (tx.type === "ISSUE") {
      movement.issued += qty;
    } else if (tx.type === "RETURN") {
      movement.returned += qty;
    } else if (tx.type === "ADJUSTMENT_IN") {
      movement.adjustmentIn += qty;
    } else if (tx.type === "ADJUSTMENT_OUT") {
      movement.adjustmentOut += qty;
    }

    movement.closing = number(tx.balanceAfter);
    movement.events++;
  }

  return [...byItem.values()];
}

// ==========================================
// BUILD DAILY REPORT DATA
// ==========================================

async function fetchDailyReport(date) {
  const range = dateRange(date);

  const [transactions, inward, issues, receiving, retrieved] =
    await Promise.all([
      findAll(StockTransaction, "transactionDate", range, [
        {
          path: "performedBy",
          select: "name role",
        },
      ]),

      findAll(StockInward, "receiptDate", range, [
        {
          path: "createdBy",
          select: "name role",
        },
      ]),

      findAll(IssuedItem, "issuedDate", range, [
        {
          path: "issuedBy",
          select: "name role",
        },
        {
          path: "receivedByTechnician",
          select: "name role",
        },
      ]),

      findAll(MaterialReceiving, "confirmedAt", range, [
        {
          path: "technician",
          select: "name role",
        },
        {
          path: "issuedItem",
          select: "item itemCode unit voucherNo",
        },
      ]),

      findAll(RetrievedItem, "receivedAt", range, [
        {
          path: "receivedBy",
          select: "name role",
        },
        {
          path: "issuedItem",
          select: "voucherNo storeSlipNo",
        },
      ]),
    ]);

  const types = (type) => transactions.filter((row) => row.type === type);

  return {
    date: range.date,

    generatedAt: new Date().toISOString(),

    timezone: TIMEZONE,

    summary: {
      stockInwardEntries: inward.length,

      materialIssueEntries: issues.length,

      technicianReceivingEntries: receiving.length,

      retrievedEntries: retrieved.length,

      stockTransactionEntries: transactions.length,

      disputedReceiving: receiving.filter((row) => row.status === "DISPUTED")
        .length,

      inwardByUnit: sumByUnit(types("INWARD"), "quantity", "unit"),

      issuedByUnit: sumByUnit(types("ISSUE"), "quantity", "unit"),

      returnByUnit: sumByUnit(types("RETURN"), "quantity", "unit"),

      retrievedByUnit: sumByUnit(retrieved, "quantity", "unit"),
    },

    movement: makeMovement(transactions),

    transactions,
    inward,
    issues,
    receiving,
    retrieved,
  };
}

// ==========================================
// BUILD EXCEL WORKBOOK SHEET DATA
// ==========================================

function excelRows(report) {
  const inwardRows = report.inward.flatMap((grn) =>
    (grn.items || []).map((line) => ({
      "Receipt Date": dateTime(grn.receiptDate),
      "Inward No": grn.inwardNo,
      "GRN No": grn.grnNo,
      "Bill No": grn.billNo,
      Vendor: grn.vendorName,
      "Item Code": line.itemCode,
      Material: line.itemName,
      Category: line.category,
      UOM: line.unit,
      "Received Qty": line.quantity,
      "Stock Before": line.stockBefore,
      "Stock After": line.stockAfter,
      "Recorded By": name(grn.createdBy),
    })),
  );

  return {
    "Daily Summary": [
      {
        Metric: "Report Date (IST)",
        Value: report.date,
      },
      {
        Metric: "Inward Entries",
        Value: report.summary.stockInwardEntries,
      },
      {
        Metric: "Material Issue Entries",
        Value: report.summary.materialIssueEntries,
      },
      {
        Metric: "Technician Receiving",
        Value: report.summary.technicianReceivingEntries,
      },
      {
        Metric: "Retrieved Materials",
        Value: report.summary.retrievedEntries,
      },
      {
        Metric: "Receiving Disputes",
        Value: report.summary.disputedReceiving,
      },
      ...[
        "inwardByUnit",
        "issuedByUnit",
        "returnByUnit",
        "retrievedByUnit",
      ].flatMap((type) =>
        report.summary[type].map((item) => ({
          Metric: `${type} (${item.unit})`,
          Value: item.quantity,
        })),
      ),
    ],

    "Stock Inward": inwardRows,

    "Material Issues": report.issues.map((item) => ({
      "Issue Date": dateTime(item.issuedDate),
      "Voucher No": item.voucherNo,
      "Store Slip": item.storeSlipNo,
      "Item Code": item.itemCode,
      Material: item.item,
      UOM: item.unit,
      "Issued Qty": item.quantity,
      "Issued To": item.issuedTo,
      "Issued By": name(item.issuedBy),
      "Receiving Status": item.receivingStatus,
      "Complaint ID": String(item.complaint || ""),
    })),

    "Technician Receiving": report.receiving.map((item) => ({
      "Confirmation Date": dateTime(item.confirmedAt),
      Technician: name(item.technician),
      "Voucher No": item.issuedItem?.voucherNo || "",
      Material: item.issuedItem?.item || "",
      UOM: item.issuedItem?.unit || "",
      Issued: item.issuedQuantity,
      Received: item.receivedQuantity,
      Shortage: item.shortageQuantity,
      Status: item.status,
      Remarks: item.technicianRemarks,
    })),

    "Retrieved Materials": report.retrieved.map((item) => ({
      "Received Date": dateTime(item.receivedAt),
      "Original Voucher": item.issuedItem?.voucherNo || "",
      "Item Code": item.itemCode,
      Material: item.itemName,
      UOM: item.unit,
      Quantity: item.quantity,
      Condition: item.condition,
      "Received From": item.receivedFrom,
      "Received By": name(item.receivedBy),
      Remarks: item.remarks,
    })),

    "Stock Ledger": report.transactions.map((item) => ({
      "Transaction Date": dateTime(item.transactionDate),
      Type: item.type,
      "Item Code": item.itemCode,
      Material: item.itemName,
      UOM: item.unit,
      Quantity: item.quantity,
      "Balance Before": item.balanceBefore,
      "Balance After": item.balanceAfter,
      Reference: item.referenceNo,
      "Performed By": name(item.performedBy),
      Remarks: item.remarks,
    })),

    "Item Movements": report.movement.map((item) => ({
      "Item Code": item.itemCode,
      Material: item.itemName,
      UOM: item.unit,
      "Opening (first ledger event)": item.opening,
      Inward: item.inward,
      Issued: item.issued,
      Returned: item.returned,
      "Adjustment In": item.adjustmentIn,
      "Adjustment Out": item.adjustmentOut,
      "Closing (last ledger event)": item.closing,
    })),
  };
}

// ==========================================
// EXCEL SHEET HEADERS
// ==========================================

const titles = {
  "Daily Summary": ["Metric", "Value"],

  "Stock Inward": [
    "Receipt Date",
    "Inward No",
    "GRN No",
    "Bill No",
    "Vendor",
    "Item Code",
    "Material",
    "Category",
    "UOM",
    "Received Qty",
    "Stock Before",
    "Stock After",
    "Recorded By",
  ],

  "Material Issues": [
    "Issue Date",
    "Voucher No",
    "Store Slip",
    "Item Code",
    "Material",
    "UOM",
    "Issued Qty",
    "Issued To",
    "Issued By",
    "Receiving Status",
    "Complaint ID",
  ],

  "Technician Receiving": [
    "Confirmation Date",
    "Technician",
    "Voucher No",
    "Material",
    "UOM",
    "Issued",
    "Received",
    "Shortage",
    "Status",
    "Remarks",
  ],

  "Retrieved Materials": [
    "Received Date",
    "Original Voucher",
    "Item Code",
    "Material",
    "UOM",
    "Quantity",
    "Condition",
    "Received From",
    "Received By",
    "Remarks",
  ],

  "Stock Ledger": [
    "Transaction Date",
    "Type",
    "Item Code",
    "Material",
    "UOM",
    "Quantity",
    "Balance Before",
    "Balance After",
    "Reference",
    "Performed By",
    "Remarks",
  ],

  "Item Movements": [
    "Item Code",
    "Material",
    "UOM",
    "Opening (first ledger event)",
    "Inward",
    "Issued",
    "Returned",
    "Adjustment In",
    "Adjustment Out",
    "Closing (last ledger event)",
  ],
};

// ==========================================
// GENERATE EXCEL (.XLSX)
// ==========================================

function writeExcel(res, report) {
  const workbook = XLSX.utils.book_new();

  const sections = excelRows(report);

  for (const [sheetName, rows] of Object.entries(sections)) {
    const headers = titles[sheetName];

    const sheet = XLSX.utils.json_to_sheet(rows, {
      header: headers,
    });

    if (!rows.length) {
      XLSX.utils.sheet_add_aoa(sheet, [headers], {
        origin: "A1",
      });
    }

    sheet["!cols"] = headers.map((h) => ({
      wch: Math.min(42, Math.max(14, h.length + 4)),
    }));

    sheet["!autofilter"] = {
      ref: sheet["!ref"],
    };

    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  }

  const buffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "buffer",
  });

  res.set({
    "Content-Type":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

    "Content-Disposition": `attachment; filename="AMI_Daily_Store_${report.date}.xlsx"`,

    "Cache-Control": "no-store",
  });

  return res.send(buffer);
}

// ==========================================
// PDF TABLE HELPER
// ==========================================

function drawTable(pdf, heading, headers, rows, widths) {
  const margin = 36;

  const pageWidth = pdf.page.width - 2 * margin;

  const scale = pageWidth / widths.reduce((a, b) => a + b, 0);

  const sizes = widths.map((w) => w * scale);

  const printHeader = () => {
    if (pdf.y > pdf.page.height - 105) {
      pdf.addPage();
    }

    pdf.moveDown(0.5);

    pdf.font("Helvetica-Bold").fontSize(11).fillColor("#001B54").text(heading);

    pdf.moveDown(0.5);

    const y = pdf.y;

    pdf.rect(margin, y, pageWidth, 24).fill("#001B54");

    let x = margin;

    headers.forEach((h, i) => {
      pdf
        .font("Helvetica-Bold")
        .fontSize(7)
        .fillColor("#FFFFFF")
        .text(h, x + 4, y + 5, {
          width: sizes[i] - 8,
          height: 18,
        });

      x += sizes[i];
    });

    pdf.y = y + 26;
  };

  printHeader();

  if (!rows.length) {
    pdf
      .fillColor("#64748B")
      .font("Helvetica")
      .fontSize(9)
      .text("No records for this date.");

    pdf.moveDown();
    return;
  }

  for (const row of rows) {
    const vals = row.map((val) => display(val));

    pdf.font("Helvetica").fontSize(7);

    const height = Math.max(
      22,
      ...vals.map(
        (v, i) =>
          pdf.heightOfString(v, {
            width: sizes[i] - 8,
          }) + 10,
      ),
    );

    if (pdf.y + height > pdf.page.height - 55) {
      pdf.addPage();
      printHeader();
    }

    const y = pdf.y;

    pdf
      .rect(margin, y, pageWidth, height)
      .strokeColor("#DDE5EF")
      .lineWidth(0.4)
      .stroke();

    let x = margin;

    vals.forEach((val, i) => {
      pdf.fillColor("#243047").text(val, x + 4, y + 4, {
        width: sizes[i] - 8,
        height: height - 8,
      });

      x += sizes[i];
    });

    pdf.y = y + height;
  }

  pdf.moveDown();
}

// ==========================================
// GENERATE A4 PDF
// ==========================================

function writePDF(res, report) {
  res.set({
    "Content-Type": "application/pdf",

    "Content-Disposition": `attachment; filename="AMI_Daily_Store_${report.date}.pdf"`,

    "Cache-Control": "no-store",
  });

  const pdf = new PDFDocument({
    size: "A4",
    margins: {
      top: 36,
      left: 36,
      right: 36,
      bottom: 45,
    },
    bufferPages: true,
  });

  pdf.pipe(res);

  pdf
    .font("Helvetica-Bold")
    .fillColor("#001B54")
    .fontSize(20)
    .text("AMI MAINTENANCE", { align: "center" });

  pdf
    .font("Helvetica")
    .fillColor("#98732A")
    .fontSize(10)
    .text("UNIVERSITY STORE DEPARTMENT", { align: "center" });

  pdf.moveDown(0.5);

  pdf
    .font("Helvetica-Bold")
    .fillColor("#001B54")
    .fontSize(14)
    .text("Daily Store Transaction Report", { align: "center" });

  pdf
    .font("Helvetica")
    .fillColor("#475569")
    .fontSize(9)
    .text(
      `Date: ${report.date} (IST) | Generated: ${dateTime(report.generatedAt)}`,
      { align: "center" },
    );

  pdf.moveDown();

  // DAILY SUMMARY

  drawTable(
    pdf,
    "Daily Summary",
    ["Metric", "Count"],
    [
      ["Stock Inward Entries", report.summary.stockInwardEntries],
      ["Material Issue Entries", report.summary.materialIssueEntries],
      [
        "Technician Receiving Confirmations",
        report.summary.technicianReceivingEntries,
      ],
      ["Retrieved / Damaged Receipts", report.summary.retrievedEntries],
      ["Receiving Disputes", report.summary.disputedReceiving],
      ["Stock Ledger Transactions", report.summary.stockTransactionEntries],
    ],
    [3, 1],
  );

  // UNIT-WISE TOTALS

  const unitRows = [
    ["Inward", report.summary.inwardByUnit],
    ["Issue", report.summary.issuedByUnit],
    ["Usable Return", report.summary.returnByUnit],
    ["Damaged Retrieval", report.summary.retrievedByUnit],
  ].flatMap(([type, values]) =>
    values.map((v) => [type, v.unit, formatQty(v.quantity)]),
  );

  drawTable(
    pdf,
    "Quantities by UOM",
    ["Movement", "UOM", "Quantity"],
    unitRows,
    [3, 2, 1],
  );

  // STOCK INWARD

  const inwardRows = report.inward.flatMap((grn) =>
    (grn.items || []).map((line) => [
      grn.grnNo || grn.inwardNo,
      line.itemName,
      line.unit,
      formatQty(line.quantity),
      grn.vendorName,
    ]),
  );

  drawTable(
    pdf,
    "1. Stock Inward / GRN",
    ["GRN", "Material", "UOM", "Qty", "Vendor"],
    inwardRows,
    [2.2, 3, 0.9, 0.9, 2.3],
  );

  // ISSUE REGISTER

  drawTable(
    pdf,
    "2. Material Issue Register",
    ["Voucher", "Material", "UOM", "Qty", "Issued To"],
    report.issues.map((i) => [
      i.voucherNo || i.storeSlipNo,
      i.item,
      i.unit,
      formatQty(i.quantity),
      i.issuedTo,
    ]),
    [2.3, 3, 0.9, 0.9, 2.2],
  );

  // TECHNICIAN RECEIVING

  drawTable(
    pdf,
    "3. Technician Receiving",
    ["Voucher", "Material", "Issued", "Received", "Short", "Status"],
    report.receiving.map((i) => [
      i.issuedItem?.voucherNo,
      i.issuedItem?.item,
      formatQty(i.issuedQuantity),
      formatQty(i.receivedQuantity),
      formatQty(i.shortageQuantity),
      i.status,
    ]),
    [2.4, 2.8, 0.8, 0.8, 0.8, 1.6],
  );

  // RETRIEVED MATERIALS

  drawTable(
    pdf,
    "4. Retrieved / Damaged Materials",
    ["Material", "Condition", "UOM", "Qty", "From"],
    report.retrieved.map((i) => [
      i.itemName,
      i.condition,
      i.unit,
      formatQty(i.quantity),
      i.receivedFrom,
    ]),
    [3, 1.5, 0.8, 0.8, 2],
  );

  // COMPLETE STOCK LEDGER

  drawTable(
    pdf,
    "5. Complete Stock Transaction Ledger",
    ["Time", "Material", "Type", "Qty", "Before", "After"],
    report.transactions.map((t) => [
      dateTime(t.transactionDate),
      t.itemName,
      t.type,
      `${formatQty(t.quantity)} ${t.unit}`,
      formatQty(t.balanceBefore),
      formatQty(t.balanceAfter),
    ]),
    [2.2, 2.6, 1.5, 1.4, 1, 1],
  );

  // ITEM-WISE MOVEMENTS

  drawTable(
    pdf,
    "6. Item-wise Movement (Ledger Activity)",
    ["Material", "UOM", "Opening*", "In", "Out", "Closing*"],
    report.movement.map((m) => [
      m.itemName,
      m.unit,
      formatQty(m.opening),
      formatQty(m.inward + m.returned + m.adjustmentIn),
      formatQty(m.issued + m.adjustmentOut),
      formatQty(m.closing),
    ]),
    [3, 1, 1.4, 1, 1, 1.4],
  );

  // REPORT FOOTER

  if (pdf.y > pdf.page.height - 110) {
    pdf.addPage();
  }

  pdf.moveDown();

  pdf
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#64748B")
    .text(
      "* Opening/closing are the first/last recorded ledger balances that day; legacy gaps can affect historical completeness.",
    )
    .text(
      "Damaged retrieval does not increase usable stock. Different units are never combined into one total.",
    );

  pdf.moveDown(3);

  pdf
    .fillColor("#001B54")
    .text(
      "Prepared by (Store Manager): __________________      Authorized signature: __________________",
    );

  // PAGE NUMBERS

  const pages = pdf.bufferedPageRange();

  for (let i = pages.start; i < pages.start + pages.count; i++) {
    pdf.switchToPage(i);

    pdf
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#64748B")
      .text(
        `AMI MAINTENANCE | ${report.date} | Page ${i + 1} of ${pages.count}`,
        36,
        pdf.page.height - 29,
        {
          width: pdf.page.width - 72,
          align: "center",
          lineBreak: false,
        },
      );
  }

  pdf.end();
}

// ==========================================
// ERROR HANDLER
// ==========================================

function handleError(res, error) {
  console.error("DAILY STORE REPORT ERROR:", error);

  if (res.headersSent) {
    return res.end();
  }

  return res.status(error.statusCode || 500).json({
    success: false,

    message: error.statusCode
      ? error.message
      : "Unable to generate the daily store report.",
  });
}

// ==========================================
// GET DAILY REPORT
// GET /api/store/reports/daily
// ==========================================

exports.getDailyReport = async (req, res) => {
  try {
    const report = await fetchDailyReport(req.query.date);

    return res.status(200).json({
      success: true,
      report,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ==========================================
// DOWNLOAD DAILY PDF / EXCEL
// GET /api/store/reports/daily/export
// ==========================================

exports.exportDailyReport = async (req, res) => {
  try {
    const format = text(req.query.format).toLowerCase();

    if (!["pdf", "xlsx"].includes(format)) {
      return res.status(400).json({
        success: false,
        message: "Use format=pdf or format=xlsx.",
      });
    }

    const report = await fetchDailyReport(req.query.date);

    if (format === "xlsx") {
      return writeExcel(res, report);
    }

    return writePDF(res, report);
  } catch (error) {
    return handleError(res, error);
  }
};
