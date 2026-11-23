"use strict";

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

const s = (v) => String(v ?? "").trim();
const num = (v) => Number(v || 0);
const person = (v) => (v && typeof v === "object" ? s(v.name) : s(v));

const dtime = (v) =>
  v
    ? new Date(v).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "";

const istDate = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (k) => parts.find((p) => p.type === k)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
};

function bad(message, code = 400) {
  const error = new Error(message);
  error.statusCode = code;
  throw error;
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s(value))) {
    bad("Use YYYY-MM-DD dates.");
  }

  const date = new Date(`${value}T00:00:00+05:30`);

  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

  if (Number.isNaN(date.getTime()) || formatted !== value) {
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

  const category = s(req.query.category) || "all";

  return {
    from,
    to,
    type,
    category,
    start,
    end: new Date(endStart.getTime() + 86400000),
  };
}

const inRange = (field, o) => ({
  [field]: {
    $gte: o.start,
    $lt: o.end,
  },
});

async function all(Model, filter, populate = []) {
  const count = await Model.countDocuments(filter);

  if (count > MAX_ROWS) {
    bad(
      `${Model.modelName}: ${count} records. Select a shorter date range.`,
      413,
    );
  }

  let query = Model.find(filter).lean();

  for (const p of populate) {
    query = query.populate(p);
  }

  const rows = await query;

  if (rows.length !== count) {
    bad("Data changed during export. Please retry.", 409);
  }

  return rows;
}

function categoryOf(value) {
  const c = s(value?.category);

  if (c.toLowerCase() === "other" || c.toLowerCase() === "others") {
    return s(value?.otherCategory) || "Others";
  }

  return c || "Uncategorized";
}

function buildInventoryLookup(inventory) {
  const byId = new Map();
  const byCode = new Map();
  const byName = new Map();

  for (const item of inventory) {
    const cat = categoryOf(item);

    byId.set(String(item._id), cat);

    if (s(item.itemCode)) {
      byCode.set(s(item.itemCode).toUpperCase(), cat);
    }

    if (s(item.itemName)) {
      byName.set(s(item.itemName).toLowerCase(), cat);
    }
  }

  return (record) => {
    if (s(record.category)) {
      return categoryOf(record);
    }

    const id = record.inventoryItem?._id || record.inventoryItem;

    return (
      byId.get(String(id || "")) ||
      byCode.get(s(record.itemCode).toUpperCase()) ||
      byName.get(s(record.item || record.itemName).toLowerCase()) ||
      "Uncategorized"
    );
  };
}

const matches = (value, selected) =>
  selected.toLowerCase() === "all" ||
  value.toLowerCase() === selected.toLowerCase();

const section = (name, headers, rows) => ({
  name,
  headers,
  rows,
});

async function build(o) {
  // Current inventory is a present-day stock snapshot.
  const want = (kind) =>
    o.type === "complete" ||
    o.type === kind ||
    (o.type === "daily" && ["issues", "inward", "retrieved"].includes(kind));

  const [inventory, issues, inward, retrieved, ledger, receiving] =
    await Promise.all([
      all(Inventory, {}),

      want("issues")
        ? all(IssuedItem, inRange("issuedDate", o), [
            { path: "issuedBy", select: "name" },
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
    items.filter((x) => matches(getter(x), o.category));

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

  const filteredReceiving = filter(receiving, (x) =>
    category(x.issuedItem || {}),
  );

  // ACTUAL MATERIAL ISSUES
  const issueRows = filteredIssues.map((i) => [
    dtime(i.issuedDate),
    category(i),
    i.itemCode,
    i.item,
    i.unit,
    i.approvedQuantity == null ? "" : num(i.approvedQuantity),
    num(i.quantity),

    // Request-level outstanding balance must be verified.
    "",
    i.voucherNo || i.storeSlipNo,
    i.hostel || i.block,
    i.issuedTo,
    person(i.issuedBy),
    i.receivingStatus,
  ]);

  // STOCK INWARD
  const inwardRows = inwardLines.map((i) => [
    dtime(i.grn.receiptDate),
    category(i),
    i.itemCode,
    i.itemName,
    i.unit,
    num(i.quantity),
    i.grn.grnNo || i.grn.inwardNo,
    i.grn.vendorName,
    i.grn.billNo,
  ]);

  // RETRIEVED ITEMS
  const retrievedRows = filteredRetrieved.map((i) => [
    dtime(i.receivedAt),
    category(i),
    i.itemCode,
    i.itemName,
    i.unit,
    num(i.quantity),
    i.condition,
    i.receivedFrom,
    i.remarks,
  ]);

  // STOCK LEDGER
  const ledgerRows = filteredLedger.map((i) => [
    dtime(i.transactionDate),
    category(i),
    i.itemCode,
    i.itemName,
    i.type,
    i.unit,
    num(i.quantity),
    num(i.balanceBefore),
    num(i.balanceAfter),
    i.referenceNo,
  ]);

  // CURRENT INVENTORY
  const inventoryRows = filteredInventory.map((i) => [
    categoryOf(i),
    i.itemCode,
    i.itemName,
    i.unit,
    num(i.openingQuantity),
    num(i.incomingQuantity),
    num(i.outgoingQuantity),
    num(i.currentStock),
    num(i.minimumStock),
    i.status,
  ]);

  // TECHNICIAN RECEIVING
  const receivingRows = filteredReceiving.map((i) => [
    dtime(i.confirmedAt),
    category(i.issuedItem || {}),
    i.issuedItem?.item || "",
    i.issuedItem?.unit || "",
    num(i.issuedQuantity),
    num(i.receivedQuantity),
    num(i.shortageQuantity),
    i.status,
    i.technicianRemarks,
  ]);

  // CATEGORY SUMMARY - NEVER MIX DIFFERENT UOMs
  const totals = new Map();

  function add(key, name, unit, cat, metric, qty) {
    const id = [cat.toLowerCase(), key.toLowerCase(), unit.toLowerCase()].join(
      "|",
    );

    const cur = totals.get(id) || {
      cat,
      name,
      unit,
      inward: 0,
      issued: 0,
      retrieved: 0,
    };

    cur[metric] += num(qty);
    totals.set(id, cur);
  }

  for (const i of inwardLines) {
    add(
      i.itemCode || i.itemName,
      i.itemName,
      i.unit,
      category(i),
      "inward",
      i.quantity,
    );
  }

  for (const i of filteredIssues) {
    add(
      i.itemCode || i.item,
      i.item,
      i.unit,
      category(i),
      "issued",
      i.quantity,
    );
  }

  for (const i of filteredRetrieved) {
    add(
      i.itemCode || i.itemName,
      i.itemName,
      i.unit,
      category(i),
      "retrieved",
      i.quantity,
    );
  }

  const categoryRows = [...totals.values()]
    .sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name))
    .map((x) => [x.cat, x.name, x.unit, x.inward, x.issued, x.retrieved]);

  const sections = {
    daily: section(
      "Daily Category Summary",
      ["Category", "Material", "UOM", "Stock Inward", "Issued", "Retrieved"],
      categoryRows,
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
  };

  const selected =
    o.type === "complete" ? Object.values(sections) : [sections[o.type]];

  return {
    selected,
    counts: Object.fromEntries(
      Object.entries(sections).map(([key, v]) => [key, v.rows.length]),
    ),
    options: o,
  };
}

// EXCEL FORMATTING
function addWorksheet(wb, data, o) {
  const ws = wb.addWorksheet(data.name.slice(0, 31));
  const count = data.headers.length;

  ws.mergeCells(1, 1, 1, count);

  ws.getCell(1, 1).value = "AMI MAINT. | UNIVERSITY STORE";

  ws.getCell(1, 1).font = {
    bold: true,
    size: 16,
    color: { argb: "FFFFFFFF" },
  };

  ws.getCell(1, 1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF001B54" },
  };

  ws.getRow(1).height = 34;
  ws.mergeCells(2, 1, 2, count);

  ws.getCell(2, 1).value =
    `${data.name} | ${o.from} to ${o.to} (IST) | Category: ${o.category}`;

  ws.getCell(2, 1).font = {
    bold: true,
    color: { argb: "FF001B54" },
  };

  ws.getRow(2).height = 28;
  ws.getRow(4).values = data.headers;
  ws.getRow(4).height = 30;

  ws.getRow(4).eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5C575" },
    };

    cell.font = {
      bold: true,
      color: { argb: "FF001B54" },
    };

    cell.alignment = {
      wrapText: true,
      vertical: "middle",
    };
  });

  data.headers.forEach((h, index) => {
    ws.getColumn(index + 1).width = Math.max(17, Math.min(30, h.length + 9));
  });

  for (const raw of data.rows) {
    const row = ws.addRow(
      raw.map((v) => {
        if (typeof v === "number") return v;

        const str = s(v);

        return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
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
          color: { argb: "FFDCE5EF" },
        },
      };
    });
  }

  ws.views = [
    {
      state: "frozen",
      ySplit: 4,
    },
  ];

  ws.autoFilter = {
    from: { row: 4, column: 1 },
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

// PDF TABLES
function pdfSection(pdf, data) {
  const left = 24;
  const width = pdf.page.width - left * 2;
  const headers = data.headers;
  const colWidth = width / headers.length;
  const bottom = () => pdf.page.height - 45;

  const heading = () => {
    pdf
      .font("Helvetica-Bold")
      .fillColor("#001B54")
      .fontSize(12)
      .text(data.name, left, pdf.y + 8, { width });

    const y = pdf.y + 6;

    pdf.rect(left, y, width, 28).fill("#001B54");

    headers.forEach((h, idx) => {
      pdf
        .font("Helvetica-Bold")
        .fontSize(6.8)
        .fillColor("white")
        .text(h, left + idx * colWidth + 3, y + 4, {
          width: colWidth - 6,
          height: 23,
        });
    });

    pdf.y = y + 30;
  };

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

  data.rows.forEach((raw, index) => {
    const row = raw.map((v) => s(v).slice(0, 140));

    pdf.font("Helvetica").fontSize(7);

    const rowHeight = Math.min(
      100,
      Math.max(
        24,
        ...row.map(
          (v) =>
            pdf.heightOfString(v, {
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

    pdf.rect(left, y, width, rowHeight).fill(index % 2 ? "#F3F6FA" : "#FFFFFF");

    pdf
      .rect(left, y, width, rowHeight)
      .lineWidth(0.3)
      .strokeColor("#D8E0EA")
      .stroke();

    row.forEach((v, idx) => {
      pdf
        .fillColor("#182A43")
        .font("Helvetica")
        .fontSize(7)
        .text(v, left + idx * colWidth + 3, y + 3, {
          width: colWidth - 6,
          height: rowHeight - 5,
        });
    });

    pdf.y = y + rowHeight;
  });

  pdf.y += 10;
}

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

  pdf
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor("#001B54")
    .text("AMI MAINT. - UNIVERSITY STORE", {
      align: "center",
    });

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
    "* Pending Qty is blank when a verified request-level balance is unavailable. Inventory section is current stock, not historical closing stock.";

  if (pdf.y > pdf.page.height - 110) {
    pdf.addPage();
  }

  pdf.font("Helvetica").fontSize(8).fillColor("#555555").text(note);

  const range = pdf.bufferedPageRange();

  for (let i = range.start; i < range.start + range.count; i++) {
    pdf.switchToPage(i);

    pdf
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#64748B")
      .text(
        `AMI MAINT. | Page ${i + 1} of ${range.count}`,
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

function errorResponse(res, e) {
  console.error("UNIFIED STORE REPORT:", e);

  if (res.headersSent) {
    return res.end();
  }

  return res.status(e.statusCode || 500).json({
    success: false,
    message: e.statusCode ? e.message : "Could not generate report.",
  });
}

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
  } catch (e) {
    return errorResponse(res, e);
  }
};

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
      sections: report.selected.map((v) => ({
        name: v.name,
        headers: v.headers,
        total: v.rows.length,
        rows: v.rows.slice(0, 50),
      })),
    });
  } catch (e) {
    return errorResponse(res, e);
  }
};

exports.exportUnifiedReport = async (req, res) => {
  try {
    const o = options(req);

    const format = s(req.query.format).toLowerCase();

    if (!["pdf", "xlsx"].includes(format)) {
      bad("Choose format=pdf or format=xlsx.");
    }

    const report = await build(o);

    if (format === "pdf") {
      return sendPDF(res, report);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "AMI MAINT.";

    report.selected.forEach((v) => {
      addWorksheet(workbook, v, o);
    });

    const buffer = await workbook.xlsx.writeBuffer();

    res.set({
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="AMI_Store_${o.type}_${o.from}_${o.to}.xlsx"`,
      "Cache-Control": "no-store",
    });

    return res.send(Buffer.from(buffer));
  } catch (e) {
    return errorResponse(res, e);
  }
};
