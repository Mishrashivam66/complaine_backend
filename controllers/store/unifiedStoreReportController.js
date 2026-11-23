"use strict";

const crypto = require("crypto");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

const Inventory = require("../../models/Inventory");
const IssuedItem = require("../../models/IssuedItem");
const StockInward = require("../../models/StockInward");
const StockTransaction = require("../../models/StockTransaction");
const RetrievedItem = require("../../models/RetrievedItem");
const MaterialReceiving = require("../../models/MaterialReceiving");

const TYPES = [
  "complete",
  "daily",
  "issues",
  "inward",
  "inventory",
  "retrieved",
  "ledger",
  "receiving",
];

const MAX_ROWS = 10000;

const s = (value) => String(value ?? "").trim();
const num = (value) => Number(value || 0);

const person = (value) =>
  value && typeof value === "object" ? s(value.name) : s(value);

// ==========================================
// DATE HELPERS - IST
// ==========================================

function dtime(value) {
  return value
    ? new Date(value).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "";
}

function istDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (key) => parts.find((part) => part.type === key)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function bad(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s(value))) {
    bad("Use YYYY-MM-DD dates.");
  }

  const date = new Date(`${value}T00:00:00+05:30`);

  if (Number.isNaN(date.getTime()) || istDate(date) !== value) {
    bad("Invalid calendar date.");
  }

  return date;
}

function options(req) {
  const today = istDate();

  const from = s(req.query.from) || today;
  const to = s(req.query.to) || from;

  const start = parseDate(from);
  const endStart = parseDate(to);

  if (endStart < start) {
    bad("From date must be on or before To date.");
  }

  if ((endStart - start) / 86400000 > 365) {
    bad("Maximum report period is 366 days.");
  }

  const type = s(req.query.type).toLowerCase() || "complete";

  if (!TYPES.includes(type)) {
    bad("Invalid report type.");
  }

  return {
    from,
    to,
    type,
    category: s(req.query.category) || "all",
    start,
    end: new Date(endStart.getTime() + 86400000),
  };
}

const inRange = (field, options) => ({
  [field]: {
    $gte: options.start,
    $lt: options.end,
  },
});

// ==========================================
// DATABASE FETCH WITH SAFETY LIMIT
// ==========================================

async function all(Model, filter, populate = []) {
  const count = await Model.countDocuments(filter);

  if (count > MAX_ROWS) {
    bad(
      `${Model.modelName}: ${count} records. Select a shorter date range.`,
      413,
    );
  }

  let query = Model.find(filter).lean();

  for (const item of populate) {
    query = query.populate(item);
  }

  const records = await query;

  if (records.length !== count) {
    bad("Data changed during export. Please retry.", 409);
  }

  return records;
}

// ==========================================
// CATEGORY RESOLUTION
// ==========================================

function categoryOf(value) {
  const category = s(value?.category);

  if (["other", "others"].includes(category.toLowerCase())) {
    return s(value?.otherCategory) || "Others";
  }

  return category || "Uncategorized";
}

function buildInventoryLookup(inventory) {
  const byId = new Map();
  const byCode = new Map();
  const byName = new Map();

  for (const item of inventory) {
    const category = categoryOf(item);

    byId.set(String(item._id), category);

    if (s(item.itemCode)) {
      byCode.set(s(item.itemCode).toUpperCase(), category);
    }

    if (s(item.itemName)) {
      byName.set(s(item.itemName).toLowerCase(), category);
    }
  }

  return (record) => {
    // Use historical category snapshot if available.
    if (s(record?.category)) {
      return categoryOf(record);
    }

    const id = record?.inventoryItem?._id || record?.inventoryItem;

    return (
      byId.get(String(id || "")) ||
      byCode.get(s(record?.itemCode).toUpperCase()) ||
      byName.get(s(record?.item || record?.itemName).toLowerCase()) ||
      "Uncategorized"
    );
  };
}

const matches = (value, selected) =>
  selected.toLowerCase() === "all" ||
  s(value).toLowerCase() === selected.toLowerCase();

// ==========================================
// REPORT SECTION
// ==========================================

const section = (name, headers, rows, receiptNo = "") => ({
  name,
  headers,
  rows,
  receiptNo,
});

// ==========================================
// DAILY SUMMARY RECEIPT NUMBER
// ==========================================
// A stable number is generated for each
// date range and selected category.
//
// Electrical -> ELEC
// Plumbing   -> PLUM
//
// Same date and category -> same report number.
// Different date/category -> different hash.
// ==========================================

function dailyReceiptNumber(o) {
  const name = s(o.category || "all").toUpperCase();

  const prefix =
    name === "ALL"
      ? "ALLC"
      : name
          .replace(/[^A-Z]/g, "")
          .slice(0, 4)
          .padEnd(4, "X");

  const suffix = crypto
    .createHash("sha256")
    .update(JSON.stringify([o.from, o.to, name]))
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();

  return `AMI-DS-${o.from.replace(/-/g, "")}-` + `${prefix}-${suffix}`;
}

// ==========================================
// BUILD COMPLETE REPORT DATA
// ==========================================

async function build(o) {
  const want = (kind) =>
    o.type === "complete" ||
    o.type === kind ||
    (o.type === "daily" && ["issues", "inward", "retrieved"].includes(kind));

  const [inventory, issues, inward, retrieved, ledger, receiving] =
    await Promise.all([
      all(Inventory, {}),

      want("issues")
        ? all(IssuedItem, inRange("issuedDate", o), [
            {
              path: "issuedBy",
              select: "name",
            },
            {
              path: "complaint",
              select: "complaintId hostel block",
            },
          ])
        : [],

      want("inward") ? all(StockInward, inRange("receiptDate", o)) : [],

      want("retrieved") ? all(RetrievedItem, inRange("receivedAt", o)) : [],

      want("ledger")
        ? all(StockTransaction, inRange("transactionDate", o))
        : [],

      want("receiving")
        ? all(MaterialReceiving, inRange("confirmedAt", o), [
            {
              path: "issuedItem",
              select: "item itemCode category otherCategory unit inventoryItem",
            },
          ])
        : [],
    ]);

  const category = buildInventoryLookup(inventory);

  const filter = (items, getter) =>
    items.filter((item) => matches(getter(item), o.category));

  const filteredIssues = filter(issues, category);

  const inwardLines = filter(
    inward.flatMap((grn) =>
      (grn.items || []).map((line) => ({
        ...line,
        grn,
      })),
    ),
    category,
  );

  const filteredRetrieved = filter(retrieved, category);

  const filteredLedger = filter(ledger, category);

  const filteredInventory = filter(inventory, categoryOf);

  const filteredReceiving = filter(receiving, (item) =>
    category(item.issuedItem || {}),
  );

  // ========================================
  // NEW DAILY SUMMARY TABLE
  // ========================================
  // Each row represents an issued voucher.
  // No draft/unconfirmed issue is included.
  // ========================================

  const dailySummaryRows = filteredIssues
    .filter((item) =>
      ["Issued", "Delivered"].includes(s(item.status || "Issued")),
    )
    .sort((a, b) => new Date(a.issuedDate) - new Date(b.issuedDate))
    .map((item, index) => {
      const hostel = s(item.hostel) || s(item.complaint?.hostel);

      const block = s(item.block) || s(item.complaint?.block);

      const location = [hostel, block].filter(Boolean).join(" / ") || "—";

      return [
        index + 1,
        s(item.item),
        s(item.unit) || "Nos",
        num(item.quantity),
        s(item.voucherNo) || s(item.storeSlipNo) || "—",
        location,
        s(item.issuedTo) || "—",
        category(item),
      ];
    });

  // ========================================
  // EXISTING MATERIAL ISSUE REPORT
  // ========================================

  const issueRows = filteredIssues.map((item) => [
    dtime(item.issuedDate),
    category(item),
    item.itemCode,
    item.item,
    item.unit,

    item.approvedQuantity == null ? "" : num(item.approvedQuantity),

    num(item.quantity),

    // Request-level remaining balance
    // must be verified independently.
    "",

    item.voucherNo || item.storeSlipNo,
    item.hostel || item.block,
    item.issuedTo,
    person(item.issuedBy),
    item.receivingStatus,
  ]);

  // ========================================
  // EXISTING STOCK INWARD REPORT
  // ========================================

  const inwardRows = inwardLines.map((item) => [
    dtime(item.grn.receiptDate),
    category(item),
    item.itemCode,
    item.itemName,
    item.unit,
    num(item.quantity),
    item.grn.grnNo || item.grn.inwardNo,
    item.grn.vendorName,
    item.grn.billNo,
  ]);

  // ========================================
  // EXISTING RETRIEVED ITEMS REPORT
  // ========================================

  const retrievedRows = filteredRetrieved.map((item) => [
    dtime(item.receivedAt),
    category(item),
    item.itemCode,
    item.itemName,
    item.unit,
    num(item.quantity),
    item.condition,
    item.receivedFrom,
    item.remarks,
  ]);

  // ========================================
  // EXISTING STOCK LEDGER REPORT
  // ========================================

  const ledgerRows = filteredLedger.map((item) => [
    dtime(item.transactionDate),
    category(item),
    item.itemCode,
    item.itemName,
    item.type,
    item.unit,
    num(item.quantity),
    num(item.balanceBefore),
    num(item.balanceAfter),
    item.referenceNo,
  ]);

  // ========================================
  // EXISTING CURRENT INVENTORY REPORT
  // ========================================
  // Current balance is not historical stock.
  // ========================================

  const inventoryRows = filteredInventory.map((item) => [
    categoryOf(item),
    item.itemCode,
    item.itemName,
    item.unit,
    num(item.openingQuantity),
    num(item.incomingQuantity),
    num(item.outgoingQuantity),
    num(item.currentStock),
    num(item.minimumStock),
    item.status,
  ]);

  // ========================================
  // EXISTING TECHNICIAN RECEIVING REPORT
  // ========================================

  const receivingRows = filteredReceiving.map((item) => [
    dtime(item.confirmedAt),
    category(item.issuedItem || {}),
    item.issuedItem?.item || "",
    item.issuedItem?.unit || "",
    num(item.issuedQuantity),
    num(item.receivedQuantity),
    num(item.shortageQuantity),
    item.status,
    item.technicianRemarks,
  ]);

  // ========================================
  // ORIGINAL CATEGORY MOVEMENT OVERVIEW
  // ========================================
  // Keep different UOM quantities separate.
  // ========================================

  const totals = new Map();

  function add(key, name, unit, cat, metric, quantity) {
    const id = [
      s(cat).toLowerCase(),
      s(key).toLowerCase(),
      s(unit).toLowerCase(),
    ].join("|");

    const previous = totals.get(id) || {
      cat,
      name,
      unit,
      inward: 0,
      issued: 0,
      retrieved: 0,
    };

    previous[metric] += num(quantity);

    totals.set(id, previous);
  }

  for (const item of inwardLines) {
    add(
      item.itemCode || item.itemName,
      item.itemName,
      item.unit,
      category(item),
      "inward",
      item.quantity,
    );
  }

  for (const item of filteredIssues) {
    add(
      item.itemCode || item.item,
      item.item,
      item.unit,
      category(item),
      "issued",
      item.quantity,
    );
  }

  for (const item of filteredRetrieved) {
    add(
      item.itemCode || item.itemName,
      item.itemName,
      item.unit,
      category(item),
      "retrieved",
      item.quantity,
    );
  }

  const categoryRows = [...totals.values()]
    .sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name))
    .map((item) => [
      item.cat,
      item.name,
      item.unit,
      item.inward,
      item.issued,
      item.retrieved,
    ]);

  // ========================================
  // ALL REPORT SECTIONS
  // ========================================

  const sections = {
    daily: section(
      "Daily Issue Summary",
      [
        "Sr No",
        "Item Name",
        "UOM",
        "Issued Quantity",
        "Issue Voucher No",
        "Location",
        "Worker / Technician",
        "Category",
      ],
      dailySummaryRows,
      dailyReceiptNumber(o),
    ),

    issues: section(
      "Material Issues",
      [
        "Issue Date",
        "Category",
        "Item Code",
        "Material",
        "UOM",
        "Approved Qty",
        "Issued Qty",
        "Pending Qty*",
        "Voucher No",
        "Location",
        "Issued To",
        "Issued By",
        "Receiving",
      ],
      issueRows,
    ),

    inward: section(
      "Stock Inward",
      [
        "Receipt Date",
        "Category",
        "Item Code",
        "Material",
        "UOM",
        "Received Qty",
        "GRN",
        "Vendor",
        "Bill No",
      ],
      inwardRows,
    ),

    inventory: section(
      "Inventory Snapshot",
      [
        "Category",
        "Item Code",
        "Material",
        "UOM",
        "Opening",
        "Incoming",
        "Outgoing",
        "Current Stock",
        "Minimum",
        "Status",
      ],
      inventoryRows,
    ),

    retrieved: section(
      "Retrieved Items",
      [
        "Received Date",
        "Category",
        "Item Code",
        "Material",
        "UOM",
        "Retrieved Qty",
        "Condition",
        "Received From",
        "Remarks",
      ],
      retrievedRows,
    ),

    ledger: section(
      "Stock Ledger",
      [
        "Date",
        "Category",
        "Item Code",
        "Material",
        "Movement",
        "UOM",
        "Qty",
        "Before",
        "After",
        "Reference",
      ],
      ledgerRows,
    ),

    receiving: section(
      "Technician Receiving",
      [
        "Confirmed At",
        "Category",
        "Material",
        "UOM",
        "Issued",
        "Received",
        "Shortage",
        "Status",
        "Remarks",
      ],
      receivingRows,
    ),

    // Original category report retained
    // inside the Complete Report export.
    categoryOverview: section(
      "Category Movement Overview",
      ["Category", "Material", "UOM", "Stock Inward", "Issued", "Retrieved"],
      categoryRows,
    ),
  };

  return {
    selected:
      o.type === "complete" ? Object.values(sections) : [sections[o.type]],

    counts: Object.fromEntries(
      Object.entries(sections).map(([key, value]) => [key, value.rows.length]),
    ),

    options: o,
  };
}

// ==========================================
// EXCEL EXPORT
// ==========================================

function addWorksheet(workbook, data, o) {
  const ws = workbook.addWorksheet(data.name.slice(0, 31));

  const count = data.headers.length;

  // MAIN TITLE
  ws.mergeCells(1, 1, 1, count);

  ws.getCell(1, 1).value = "AMI MAINT. | UNIVERSITY STORE";

  ws.getCell(1, 1).font = {
    bold: true,
    size: 16,
    color: {
      argb: "FFFFFFFF",
    },
  };

  ws.getCell(1, 1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {
      argb: "FF001B54",
    },
  };

  ws.getRow(1).height = 34;

  // DATE, CATEGORY AND RECEIPT NUMBER
  ws.mergeCells(2, 1, 2, count);

  ws.getCell(2, 1).value =
    `${data.name} | ${o.from} to ${o.to} (IST) | Category: ${o.category}` +
    (data.receiptNo ? `\nReceipt No: ${data.receiptNo}` : "");

  ws.getCell(2, 1).font = {
    bold: true,
    color: {
      argb: "FF001B54",
    },
  };

  ws.getCell(2, 1).alignment = {
    wrapText: true,
    vertical: "middle",
  };

  ws.getRow(2).height = data.receiptNo ? 46 : 28;

  // TABLE HEADERS
  ws.getRow(4).values = data.headers;
  ws.getRow(4).height = 30;

  ws.getRow(4).eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb: "FFE5C575",
      },
    };

    cell.font = {
      bold: true,
      color: {
        argb: "FF001B54",
      },
    };

    cell.alignment = {
      wrapText: true,
      vertical: "middle",
    };
  });

  data.headers.forEach((header, index) => {
    ws.getColumn(index + 1).width = Math.max(
      17,
      Math.min(30, header.length + 9),
    );
  });

  // REPORT DATA
  for (const values of data.rows) {
    const row = ws.addRow(
      values.map((value) => {
        if (typeof value === "number") {
          return value;
        }

        const text = s(value);

        // Prevent spreadsheet formula injection.
        return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      }),
    );

    row.eachCell((cell) => {
      cell.alignment = {
        wrapText: true,
        vertical: "top",
      };

      cell.border = {
        bottom: {
          style: "hair",
          color: {
            argb: "FFDCE5EF",
          },
        },
      };
    });
  }

  // EXCEL FILTERS
  ws.views = [
    {
      state: "frozen",
      ySplit: 4,
    },
  ];

  ws.autoFilter = {
    from: {
      row: 4,
      column: 1,
    },
    to: {
      row: Math.max(5, ws.lastRow.number),
      column: count,
    },
  };

  ws.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };

  ws.headerFooter.oddFooter = "AMI MAINT. | University Store | Page &P of &N";
}

// ==========================================
// PDF REPORT TABLE
// ==========================================

function pdfSection(pdf, data) {
  const left = 24;
  const width = pdf.page.width - left * 2;

  const headers = data.headers;
  const colWidth = width / headers.length;

  const bottom = () => pdf.page.height - 45;

  function heading() {
    // SECTION TITLE
    pdf
      .font("Helvetica-Bold")
      .fillColor("#001B54")
      .fontSize(12)
      .text(data.name, left, pdf.y + 8, { width });

    // DAILY RECEIPT NUMBER
    if (data.receiptNo) {
      pdf
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#475569")
        .text(`Receipt No: ${data.receiptNo}`, left, pdf.y + 2, { width });
    }

    const y = pdf.y + 6;

    // TABLE HEADER BACKGROUND
    pdf.rect(left, y, width, 28).fill("#001B54");

    headers.forEach((header, index) => {
      pdf
        .font("Helvetica-Bold")
        .fontSize(6.8)
        .fillColor("white")
        .text(header, left + index * colWidth + 3, y + 4, {
          width: colWidth - 6,
          height: 23,
        });
    });

    pdf.y = y + 30;
  }

  if (pdf.y > bottom() - 85) {
    pdf.addPage();
  }

  heading();

  if (!data.rows.length) {
    pdf
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#64748B")
      .text("No records found.", left, pdf.y + 8);

    pdf.y += 14;
    return;
  }

  data.rows.forEach((values, index) => {
    const row = values.map((value) => s(value).slice(0, 140));

    pdf.font("Helvetica").fontSize(7);

    const rowHeight = Math.min(
      100,
      Math.max(
        24,
        ...row.map(
          (value) =>
            pdf.heightOfString(value, {
              width: Math.max(12, colWidth - 6),
            }) + 8,
        ),
      ),
    );

    if (pdf.y + rowHeight > bottom()) {
      pdf.addPage();
      heading();
    }

    const y = pdf.y;

    // ALTERNATING ROW BACKGROUND
    pdf.rect(left, y, width, rowHeight).fill(index % 2 ? "#F3F6FA" : "#FFFFFF");

    // ROW BORDER
    pdf
      .rect(left, y, width, rowHeight)
      .lineWidth(0.3)
      .strokeColor("#D8E0EA")
      .stroke();

    row.forEach((value, column) => {
      pdf
        .font("Helvetica")
        .fontSize(7)
        .fillColor("#182A43")
        .text(value, left + column * colWidth + 3, y + 3, {
          width: colWidth - 6,
          height: rowHeight - 5,
        });
    });

    pdf.y = y + rowHeight;
  });

  pdf.y += 10;
}

// ==========================================
// COMPLETE PDF EXPORT
// ==========================================

function sendPDF(res, report) {
  const o = report.options;

  const pdf = new PDFDocument({
    size: "A3",
    layout: "landscape",

    margins: {
      top: 28,
      left: 24,
      right: 24,
      bottom: 40,
    },

    bufferPages: true,
  });

  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="AMI_Store_${o.type}_${o.from}_${o.to}.pdf"`,
    "Cache-Control": "no-store",
  });

  pdf.pipe(res);

  // MAIN REPORT HEADER
  pdf
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor("#001B54")
    .text("AMI MAINT. - UNIVERSITY STORE", { align: "center" });

  // SELECTED DATE AND CATEGORY
  pdf
    .font("Helvetica")
    .fontSize(10)
    .text(`${o.from} to ${o.to} (IST) | Category: ${o.category}`, {
      align: "center",
    });

  report.selected.forEach((data) => {
    pdfSection(pdf, data);
  });

  const note =
    "* Pending Qty is blank when a verified request-level balance is unavailable. " +
    "Inventory section is current stock, not historical closing stock.";

  if (pdf.y > pdf.page.height - 110) {
    pdf.addPage();
  }

  pdf.font("Helvetica").fontSize(8).fillColor("#555555").text(note);

  // PAGE NUMBERS
  const pageRange = pdf.bufferedPageRange();

  for (
    let page = pageRange.start;
    page < pageRange.start + pageRange.count;
    page++
  ) {
    pdf.switchToPage(page);

    pdf
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#64748B")
      .text(
        `AMI MAINT. | Page ${page + 1} of ${pageRange.count}`,
        24,
        pdf.page.height - 25,
        {
          width: pdf.page.width - 48,
          align: "center",
          height: 12,
          lineBreak: false,
        },
      );
  }

  pdf.end();
}

// ==========================================
// ERROR RESPONSE
// ==========================================

function errorResponse(res, error) {
  console.error("UNIFIED STORE REPORT:", error);

  if (res.headersSent) {
    return res.end();
  }

  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.statusCode ? error.message : "Could not generate report.",
  });
}

// ==========================================
// GET ALL REPORT CATEGORIES
// ==========================================

exports.getReportCategories = async (_req, res) => {
  try {
    const inventory = await Inventory.find({})
      .select("category otherCategory")
      .lean();

    const categories = [...new Set(inventory.map(categoryOf))].sort((a, b) =>
      a.localeCompare(b),
    );

    return res.json({
      success: true,
      categories,
    });
  } catch (error) {
    return errorResponse(res, error);
  }
};

// ==========================================
// GET REPORT PREVIEW
// ==========================================

exports.getUnifiedPreview = async (req, res) => {
  try {
    const o = options(req);
    const report = await build(o);

    return res.json({
      success: true,

      from: o.from,
      to: o.to,
      category: o.category,

      counts: report.counts,

      sections: report.selected.map((item) => ({
        name: item.name,

        // Receipt number for frontend preview
        receiptNo: item.receiptNo || "",

        headers: item.headers,
        total: item.rows.length,

        // Preview only first 50 rows
        rows: item.rows.slice(0, 50),
      })),
    });
  } catch (error) {
    return errorResponse(res, error);
  }
};

// ==========================================
// EXPORT REPORT AS PDF OR EXCEL
// ==========================================

exports.exportUnifiedReport = async (req, res) => {
  try {
    const o = options(req);

    const format = s(req.query.format).toLowerCase();

    if (!["pdf", "xlsx"].includes(format)) {
      bad("Choose format=pdf or format=xlsx.");
    }

    const report = await build(o);

    // PDF EXPORT
    if (format === "pdf") {
      return sendPDF(res, report);
    }

    // EXCEL EXPORT
    const workbook = new ExcelJS.Workbook();

    workbook.creator = "AMI MAINT.";

    report.selected.forEach((item) => {
      addWorksheet(workbook, item, o);
    });

    const buffer = await workbook.xlsx.writeBuffer();

    res.set({
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

      "Content-Disposition": `attachment; filename="AMI_Store_${o.type}_${o.from}_${o.to}.xlsx"`,

      "Cache-Control": "no-store",
    });

    return res.send(Buffer.from(buffer));
  } catch (error) {
    return errorResponse(res, error);
  }
};
