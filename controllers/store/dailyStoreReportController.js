"use strict";

const ExcelJS = require("exceljs");
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

async function writeExcel(res, report) {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "AMI MAINTENANCE";
  workbook.lastModifiedBy = "University Store Department";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = "Daily Store Transaction Report";
  workbook.title = `AMI Daily Store Report - ${report.date}`;
  workbook.company = "Amity University Madhya Pradesh";

  const NAVY = "001B54";
  const DARK_NAVY = "061E42";
  const GOLD = "D4AD58";
  const WHITE = "FFFFFF";
  const LIGHT_BLUE = "EEF4FC";
  const LIGHT_GOLD = "FFF8E8";
  const TEXT = "253653";
  const MUTED = "64748B";
  const BORDER = "DDE5EF";
  const GREEN = "047857";
  const RED = "B91C1C";

  const sections = excelRows(report);

  const columnWidths = {
    "Item Code": 39,
    "Item Description": 34,
    Material: 31,
    "GRN No": 26,
    "Inward No": 32,
    "Voucher No": 34,
    "Store Slip": 34,
    "Original Voucher": 34,
    "Complaint ID": 30,
    "Bill No": 22,
    Vendor: 27,
    "Received From": 27,
    "Received By": 27,
    "Issued To": 27,
    "Issued By": 27,
    Technician: 27,
    "Recorded By": 27,
    "Performed By": 27,
    Remarks: 36,
    "Receiving Status": 27,
    Status: 23,
    "Receipt Date": 25,
    "Issue Date": 25,
    "Received Date": 25,
    "Transaction Date": 25,
    "Confirmation Date": 25,
    "Opening (first ledger event)": 26,
    "Closing (last ledger event)": 26,
    Metric: 38,
    Value: 25,
  };

  const formatSheetTitle = (sheetName) => {
    const labels = {
      "Daily Summary": "DAILY STORE SUMMARY",
      "Stock Inward": "STOCK INWARD / GRN REGISTER",
      "Material Issues": "MATERIAL ISSUE REGISTER",
      "Technician Receiving": "TECHNICIAN RECEIVING REGISTER",
      "Retrieved Materials": "RETRIEVED MATERIAL REGISTER",
      "Stock Ledger": "STOCK TRANSACTION LEDGER",
      "Item Movements": "ITEM-WISE STOCK MOVEMENT",
    };

    return labels[sheetName] || sheetName.toUpperCase();
  };

  // Prevent spreadsheet formula injection from
  // externally supplied vendor/material/remarks text.
  const safeCellValue = (value) => {
    if (value === null || value === undefined) {
      return "";
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : "";
    }

    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }

    const stringValue = String(value);

    if (/^\s*[=+\-@\t\r]/.test(stringValue)) {
      return `'${stringValue}`;
    }

    return stringValue;
  };

  const quantityColumns = new Set([
    "Received Qty",
    "Issued Qty",
    "Stock Before",
    "Stock After",
    "Opening (first ledger event)",
    "Closing (last ledger event)",
    "Quantity",
    "Issued",
    "Received",
    "Shortage",
    "Balance Before",
    "Balance After",
    "Inward",
    "Returned",
    "Adjustment In",
    "Adjustment Out",
    "Adjustment Out",
  ]);

  for (const [sheetName, dataRows] of Object.entries(sections)) {
    const sheet = workbook.addWorksheet(sheetName, {
      views: [
        {
          state: "frozen",
          ySplit: 7,
          showGridLines: false,
        },
      ],
      pageSetup: {
        paperSize: 9,
        orientation: sheetName === "Daily Summary" ? "portrait" : "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.3,
          right: 0.3,
          top: 0.5,
          bottom: 0.5,
          header: 0.2,
          footer: 0.2,
        },
      },
      properties: {
        defaultRowHeight: 20,
      },
    });

    const headers = titles[sheetName];

    const columnCount = headers.length;

    const lastColumn = sheet.getColumn(columnCount).letter;

    // ======================================
    // COLUMN WIDTHS
    // ======================================

    headers.forEach((header, index) => {
      let width = columnWidths[header] || 20;

      if (header === "UOM") width = 12;

      if (["Type", "Source", "Condition"].includes(header)) {
        width = 18;
      }

      if (
        [
          "Quantity",
          "Issued",
          "Received",
          "Shortage",
          "Inward",
          "Returned",
          "Adjustment In",
          "Adjustment Out",
          "Stock Before",
          "Stock After",
          "Balance Before",
          "Balance After",
        ].includes(header)
      ) {
        width = 19;
      }

      sheet.getColumn(index + 1).width = width;
    });

    // ======================================
    // UNIVERSITY HEADER
    // ======================================

    sheet.mergeCells(`A1:${lastColumn}2`);

    const titleCell = sheet.getCell("A1");

    titleCell.value = "AMI MAINTENANCE";

    titleCell.font = {
      name: "Aptos Display",
      size: 23,
      bold: true,
      color: { argb: WHITE },
    };

    titleCell.alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    titleCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: DARK_NAVY },
    };

    sheet.getRow(1).height = 25;
    sheet.getRow(2).height = 28;

    // Fill entire header background.
    for (let col = 1; col <= columnCount; col++) {
      for (let row = 1; row <= 2; row++) {
        sheet.getCell(row, col).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: DARK_NAVY },
        };
      }
    }

    sheet.mergeCells(`A3:${lastColumn}3`);

    const departmentCell = sheet.getCell("A3");

    departmentCell.value =
      "AMITY UNIVERSITY MADHYA PRADESH  |  UNIVERSITY STORE DEPARTMENT";

    departmentCell.font = {
      name: "Aptos",
      size: 11,
      bold: true,
      color: { argb: NAVY },
    };

    departmentCell.alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    departmentCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "F5E7C5" },
    };

    sheet.getRow(3).height = 30;

    // ======================================
    // REPORT TITLE
    // ======================================

    sheet.mergeCells(`A4:${lastColumn}4`);

    const reportTitle = sheet.getCell("A4");

    reportTitle.value = formatSheetTitle(sheetName);

    reportTitle.font = {
      name: "Aptos Display",
      size: 15,
      bold: true,
      color: { argb: NAVY },
    };

    reportTitle.alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    reportTitle.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: LIGHT_BLUE },
    };

    sheet.getRow(4).height = 34;

    // ======================================
    // REPORT DATE
    // ======================================

    sheet.mergeCells(`A5:${lastColumn}5`);

    const dateCell = sheet.getCell("A5");

    dateCell.value = `REPORT DATE: ${report.date}   |   TIME ZONE: IST   |   GENERATED BY AMI MAINTENANCE`;

    dateCell.font = {
      name: "Aptos",
      size: 10,
      bold: true,
      color: { argb: TEXT },
    };

    dateCell.alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    dateCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: LIGHT_GOLD },
    };

    sheet.getRow(5).height = 27;

    // Empty separator row
    sheet.getRow(6).height = 12;

    // ======================================
    // TABLE HEADERS
    // ======================================

    const headerRow = sheet.getRow(7);

    headerRow.values = [undefined, ...headers];

    headerRow.height = 34;

    headerRow.eachCell((cell) => {
      cell.font = {
        name: "Aptos",
        bold: true,
        size: 11,
        color: { argb: WHITE },
      };

      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: NAVY },
      };

      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };

      cell.border = {
        bottom: {
          style: "medium",
          color: { argb: GOLD },
        },
      };
    });

    // ======================================
    // DATA ROWS
    // ======================================

    if (!dataRows.length) {
      sheet.mergeCells(`A8:${lastColumn}8`);

      const emptyCell = sheet.getCell("A8");

      emptyCell.value = "No transactions recorded for the selected date.";

      emptyCell.font = {
        name: "Aptos",
        size: 11,
        italic: true,
        color: { argb: MUTED },
      };

      emptyCell.alignment = {
        horizontal: "center",
        vertical: "middle",
      };

      emptyCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "F8FAFC" },
      };

      sheet.getRow(8).height = 32;
    } else {
      dataRows.forEach((data, rowIndex) => {
        const row = sheet.getRow(rowIndex + 8);

        const values = headers.map((header) => safeCellValue(data[header]));

        row.values = [undefined, ...values];

        row.height = 34;

        row.eachCell({ includeEmpty: true }, (cell, colIndex) => {
          cell.font = {
            name: "Aptos",
            size: 10,
            color: { argb: TEXT },
            bold: colIndex === 1 && sheetName === "Daily Summary",
          };

          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: {
              argb: rowIndex % 2 === 0 ? WHITE : "F3F7FD",
            },
          };

          cell.alignment = {
            vertical: "middle",
            horizontal: typeof cell.value === "number" ? "right" : "left",
            wrapText: false,
            shrinkToFit: false,
            indent: typeof cell.value === "number" ? 0 : 1,
          };

          cell.border = {
            bottom: {
              style: "hair",
              color: { argb: BORDER },
            },
          };

          const header = headers[colIndex - 1];

          if (
            typeof cell.value === "number" &&
            (quantityColumns.has(header) || header === "Value")
          ) {
            cell.numFmt = "#,##0.###";
          }

          // Status colour
          if (["Status", "Receiving Status"].includes(header)) {
            const status = String(cell.value || "").toUpperCase();

            if (status.includes("CONFIRMED") || status === "RESOLVED") {
              cell.font = {
                name: "Aptos",
                size: 10,
                bold: true,
                color: { argb: GREEN },
              };
            } else if (
              status.includes("DISPUTED") ||
              status.includes("SHORTAGE")
            ) {
              cell.font = {
                name: "Aptos",
                size: 10,
                bold: true,
                color: { argb: RED },
              };
            }
          }

          // Movement types
          if (header === "Type") {
            const type = String(cell.value || "").toUpperCase();

            cell.font = {
              name: "Aptos",
              size: 10,
              bold: true,
              color: {
                argb:
                  type === "INWARD" || type === "RETURN"
                    ? GREEN
                    : type === "ISSUE"
                      ? RED
                      : NAVY,
              },
            };
          }
        });
      });
    }

    // ======================================
    // FILTERS
    // ======================================

    if (dataRows.length) {
      sheet.autoFilter = {
        from: {
          row: 7,
          column: 1,
        },
        to: {
          row: dataRows.length + 7,
          column: columnCount,
        },
      };
    }

    // ======================================
    // PRINT SETTINGS
    // ======================================

    sheet.headerFooter.oddFooter =
      "AMI MAINTENANCE  |  UNIVERSITY STORE DEPARTMENT  |  Page &P of &N";

    sheet.printOptions = {
      horizontalCentered: true,
    };

    sheet.pageSetup.printTitlesRow = "1:7";

    sheet.pageSetup.printArea = `A1:${lastColumn}${Math.max(8, dataRows.length + 7)}`;

    // ======================================
    // TAB COLOURS
    // ======================================

    sheet.properties.tabColor = {
      argb: sheetName === "Daily Summary" ? GOLD : NAVY,
    };
  }

  // ========================================
  // GENERATE XLSX
  // ========================================

  const buffer = await workbook.xlsx.writeBuffer();

  res.set({
    "Content-Type":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

    "Content-Disposition": `attachment; filename="AMI_Daily_Store_${report.date}.xlsx"`,

    "Cache-Control": "no-store",
  });

  return res.send(Buffer.from(buffer));
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

function drawTable(pdf, heading, headers, rows, widths) {
  const LEFT = 38;
  const RIGHT = 38;
  const TOP = 45;
  const BOTTOM = pdf.page.height - 65;

  const pageWidth = pdf.page.width - LEFT - RIGHT;
  const total = widths.reduce((sum, value) => sum + value, 0);
  const columns = widths.map((value) => (value / total) * pageWidth);

  function resetCursor(y) {
    pdf.x = LEFT;
    pdf.y = y;
  }

  function newPage() {
    pdf.addPage();
    resetCursor(TOP);
  }

  function ensureSpace(height) {
    if (pdf.y + height > BOTTOM) {
      newPage();
    }
  }

  function tableHeader(includeTitle = true) {
    ensureSpace(includeTitle ? 78 : 45);

    let currentY = pdf.y;

    if (includeTitle) {
      pdf
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor("#001B54")
        .text(heading, LEFT, currentY, {
          width: pageWidth,
          height: 20,
          lineBreak: false,
        });

      currentY += 27;
    }

    const headerHeight = 29;

    pdf.rect(LEFT, currentY, pageWidth, headerHeight).fill("#001B54");

    let x = LEFT;

    headers.forEach((header, index) => {
      pdf
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .fillColor("#FFFFFF")
        .text(String(header), x + 5, currentY + 8, {
          width: columns[index] - 10,
          height: 15,
          ellipsis: true,
          lineBreak: false,
        });

      x += columns[index];
    });

    resetCursor(currentY + headerHeight);
  }

  resetCursor(pdf.y + 14);
  tableHeader();

  if (!rows.length) {
    const y = pdf.y;

    pdf.rect(LEFT, y, pageWidth, 30).fill("#F8FAFC");

    pdf
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor("#64748B")
      .text("No records for selected date.", LEFT + 10, y + 9, {
        width: pageWidth - 20,
        height: 14,
        lineBreak: false,
      });

    resetCursor(y + 36);
    return;
  }

  rows.forEach((row, rowIndex) => {
    const values = row.map((value) => display(value));

    pdf.font("Helvetica").fontSize(7.5);

    const textHeights = values.map((value, index) =>
      pdf.heightOfString(value, {
        width: Math.max(12, columns[index] - 10),
      }),
    );

    const rowHeight = Math.min(
      65,
      Math.max(30, ...textHeights.map((height) => height + 12)),
    );

    if (pdf.y + rowHeight > BOTTOM) {
      newPage();
      tableHeader(false);
    }

    const y = pdf.y;

    pdf
      .rect(LEFT, y, pageWidth, rowHeight)
      .fill(rowIndex % 2 === 0 ? "#FFFFFF" : "#F4F7FB");

    pdf
      .rect(LEFT, y, pageWidth, rowHeight)
      .lineWidth(0.4)
      .strokeColor("#DCE4ED")
      .stroke();

    let x = LEFT;

    values.forEach((value, index) => {
      pdf
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor("#243047")
        .text(value, x + 5, y + 7, {
          width: columns[index] - 10,
          height: rowHeight - 12,
          ellipsis: true,
          lineBreak: false,
        });

      x += columns[index];
    });

    resetCursor(y + rowHeight);
  });

  resetCursor(pdf.y + 8);
}

// ==========================================
// PROFESSIONAL DAILY STORE A4 PDF
// ==========================================

function writePDF(res, report) {
  const pdf = new PDFDocument({
    size: "A4",
    margins: {
      top: 42,
      bottom: 58,
      left: 38,
      right: 38,
    },
    bufferPages: true,
  });

  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="AMI_Daily_Store_${report.date}.pdf"`,
    "Cache-Control": "no-store",
  });

  pdf.pipe(res);

  const LEFT = 38;
  const WIDTH = pdf.page.width - 76;

  // ========================================
  // HEADER
  // ========================================

  pdf
    .font("Helvetica-Bold")
    .fontSize(20)
    .fillColor("#001B54")
    .text("AMI MAINTENANCE", LEFT, 45, {
      width: WIDTH,
      align: "center",
      lineBreak: false,
    });

  pdf
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#A17E38")
    .text("UNIVERSITY STORE DEPARTMENT", LEFT, 74, {
      width: WIDTH,
      align: "center",
      lineBreak: false,
    });

  pdf
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor("#001B54")
    .text("DAILY STORE TRANSACTION REPORT", LEFT, 99, {
      width: WIDTH,
      align: "center",
      lineBreak: false,
    });

  pdf
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#64748B")
    .text(`Report Date: ${report.date} (IST)`, LEFT, 123, {
      width: WIDTH,
      align: "center",
      lineBreak: false,
    });

  pdf
    .moveTo(LEFT, 150)
    .lineTo(LEFT + WIDTH, 150)
    .lineWidth(1.5)
    .strokeColor("#C9A65D")
    .stroke();

  pdf.x = LEFT;
  pdf.y = 163;

  // ========================================
  // 1. DAILY SUMMARY
  // ========================================

  drawTable(
    pdf,
    "1. DAILY STORE SUMMARY",
    ["PARTICULARS", "TOTAL"],
    [
      ["Stock Inward Entries", report.summary.stockInwardEntries],
      ["Material Issue Entries", report.summary.materialIssueEntries],
      ["Technician Receiving", report.summary.technicianReceivingEntries],
      ["Retrieved / Damaged Receipts", report.summary.retrievedEntries],
      ["Receiving Disputes", report.summary.disputedReceiving],
      ["Stock Ledger Transactions", report.summary.stockTransactionEntries],
    ],
    [4, 1],
  );

  // ========================================
  // 2. QUANTITY BY UNIT
  // ========================================

  const unitRows = [
    ["Stock Inward", report.summary.inwardByUnit],
    ["Material Issue", report.summary.issuedByUnit],
    ["Usable Return", report.summary.returnByUnit],
    ["Damaged Retrieval", report.summary.retrievedByUnit],
  ].flatMap(([type, values]) =>
    (values || []).map((item) => [type, item.unit, formatQty(item.quantity)]),
  );

  drawTable(
    pdf,
    "2. MATERIAL QUANTITY SUMMARY",
    ["MOVEMENT", "UOM", "QUANTITY"],
    unitRows,
    [3, 1.5, 1.5],
  );

  // ========================================
  // 3. STOCK INWARD
  // ========================================

  const inwardRows = report.inward.flatMap((grn) =>
    (grn.items || []).map((item) => [
      grn.grnNo || grn.inwardNo,
      item.itemName,
      item.unit,
      formatQty(item.quantity),
      grn.vendorName,
    ]),
  );

  drawTable(
    pdf,
    "3. STOCK INWARD / GRN REGISTER",
    ["GRN", "MATERIAL", "UOM", "QTY", "VENDOR"],
    inwardRows,
    [2.5, 3, 0.8, 0.8, 2],
  );

  // ========================================
  // 4. MATERIAL ISSUE
  // ========================================

  drawTable(
    pdf,
    "4. MATERIAL ISSUE REGISTER",
    ["VOUCHER", "MATERIAL", "UOM", "QTY", "ISSUED TO"],
    report.issues.map((item) => [
      item.voucherNo || item.storeSlipNo,
      item.item,
      item.unit,
      formatQty(item.quantity),
      item.issuedTo,
    ]),
    [2.8, 2.8, 0.8, 0.8, 2],
  );

  // ========================================
  // 5. TECHNICIAN RECEIVING
  // ========================================

  drawTable(
    pdf,
    "5. TECHNICIAN MATERIAL RECEIVING",
    ["MATERIAL", "ISSUED", "RECEIVED", "SHORT", "STATUS"],
    report.receiving.map((item) => [
      item.issuedItem?.item,
      formatQty(item.issuedQuantity),
      formatQty(item.receivedQuantity),
      formatQty(item.shortageQuantity),
      item.status,
    ]),
    [3, 1.2, 1.2, 1.2, 2],
  );

  // ========================================
  // 6. RETRIEVED MATERIALS
  // ========================================

  drawTable(
    pdf,
    "6. RETRIEVED / DAMAGED MATERIALS",
    ["MATERIAL", "CONDITION", "UOM", "QTY", "RECEIVED FROM"],
    report.retrieved.map((item) => [
      item.itemName,
      item.condition,
      item.unit,
      formatQty(item.quantity),
      item.receivedFrom,
    ]),
    [3, 1.5, 0.8, 0.8, 2],
  );

  // ========================================
  // 7. STOCK TRANSACTION LEDGER
  // ========================================

  drawTable(
    pdf,
    "7. STOCK TRANSACTION LEDGER",
    ["DATE / TIME", "MATERIAL", "TYPE", "QTY", "BEFORE", "AFTER"],
    report.transactions.map((item) => [
      dateTime(item.transactionDate),
      item.itemName,
      item.type,
      `${formatQty(item.quantity)} ${item.unit || ""}`,
      formatQty(item.balanceBefore),
      formatQty(item.balanceAfter),
    ]),
    [2.1, 2.5, 1.5, 1.5, 1, 1],
  );

  // ========================================
  // 8. ITEM-WISE MOVEMENTS
  // ========================================

  drawTable(
    pdf,
    "8. ITEM-WISE STOCK MOVEMENT",
    ["MATERIAL", "UOM", "OPENING*", "IN", "OUT", "CLOSING*"],
    report.movement.map((item) => [
      item.itemName,
      item.unit,
      formatQty(item.opening),
      formatQty(item.inward + item.returned + item.adjustmentIn),
      formatQty(item.issued + item.adjustmentOut),
      formatQty(item.closing),
    ]),
    [3, 0.9, 1.4, 1, 1, 1.4],
  );

  // ========================================
  // NOTES AND SIGNATURES
  // ========================================

  if (pdf.y > pdf.page.height - 155) {
    pdf.addPage();
    pdf.x = LEFT;
    pdf.y = 45;
  }

  const noteY = pdf.y + 10;

  pdf
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#64748B")
    .text(
      "* Opening and closing balances reflect the first and last available ledger entries for the day. Legacy history may be incomplete.",
      LEFT,
      noteY,
      {
        width: WIDTH,
      },
    );

  const signatureY = noteY + 70;

  pdf
    .moveTo(LEFT, signatureY)
    .lineTo(LEFT + 195, signatureY)
    .strokeColor("#64748B")
    .stroke();

  pdf
    .moveTo(LEFT + 305, signatureY)
    .lineTo(LEFT + 495, signatureY)
    .stroke();

  pdf
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor("#001B54")
    .text("Prepared By / Store Manager", LEFT, signatureY + 8, {
      width: 195,
      lineBreak: false,
    });

  pdf
    .font("Helvetica-Bold")
    .fontSize(8)
    .text("Authorized Signature", LEFT + 305, signatureY + 8, {
      width: 190,
      lineBreak: false,
    });

  // ========================================
  // PAGE NUMBERS
  // ========================================

  const range = pdf.bufferedPageRange();

  for (let page = range.start; page < range.start + range.count; page++) {
    pdf.switchToPage(page);

    const y = pdf.page.height - 42;

    pdf
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#64748B")
      .text(
        `AMI MAINTENANCE | ${report.date} | Page ${page + 1} of ${range.count}`,
        LEFT,
        y,
        {
          width: WIDTH,
          height: 12,
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
      return await writeExcel(res, report);
    }

    return writePDF(res, report);
  } catch (error) {
    return handleError(res, error);
  }
};
