"use strict";

const Complaint = require("../../models/Complaint");

// ==========================================
// CONSTANTS
// ==========================================

const FINISHED = ["COMPLETED", "RESOLVED", "CLOSED"];

const WAITING = ["WAITING_MATERIAL", "WAITING_FOR_MATERIAL"];

const VALID_AREAS = ["HOSTEL", "DEPARTMENT", "CAMPUS"];

const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const KNOWN_STATUSES = [
  "PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_MATERIAL",
  "REOPENED",
  "COMPLETED",
  "RESOLVED",
  "CLOSED",
];

// ==========================================
// TEXT HELPERS
// ==========================================

const text = (value, max = 250) =>
  String(value ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ")
    .trim()
    .slice(0, max);

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const excelValue = (value, max = 2000) => {
  const valueText = text(value, max);

  return /^[\s]*[=+@-]/.test(valueText) ? `'${valueText}` : valueText;
};

// ==========================================
// IST DATE HELPERS
// ==========================================

function parseDate(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error("Dates must be YYYY-MM-DD");
  }

  const [year, month, day] = iso.split("-").map(Number);

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Invalid calendar date");
  }

  return date;
}

function midnightIST(day, next = false) {
  const date = new Date(day);

  if (next) {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return new Date(date.getTime() - 330 * 60 * 1000);
}

// ==========================================
// LOCATION MATCHING
// ==========================================

// H1 matches H1 and Hostel H1,
// but never H10.

function codeReference(code) {
  const safe = escapeRegex(code);

  return new RegExp(`(?:^|[^a-z0-9])${safe}(?:$|[^a-z0-9])`, "i");
}

function exact(value) {
  return new RegExp(`^\\s*${escapeRegex(value)}\\s*$`, "i");
}

// ==========================================
// BUILD MONGODB REPORT QUERY
// ==========================================

function buildQuery(params = {}) {
  const filter = {};
  const applied = {};

  // ----------------------------------------
  // DATE FILTER
  // ----------------------------------------

  const startProvided = Boolean(params.startDate);

  const endProvided = Boolean(params.endDate);

  if (startProvided !== endProvided) {
    throw new Error("Both startDate and endDate are required");
  }

  if (startProvided) {
    const from = parseDate(params.startDate);

    const to = parseDate(params.endDate);

    if (from > to) {
      throw new Error("End date must not be before start date");
    }

    filter.createdAt = {
      $gte: midnightIST(from),
      $lt: midnightIST(to, true),
    };

    applied.startDate = params.startDate;
    applied.endDate = params.endDate;
  }

  // ----------------------------------------
  // STATUS FILTER
  // ----------------------------------------

  const status = text(params.status || "ALL", 40).toUpperCase();

  if (
    !["ALL", "ACTIVE_WORK", "FINISHED", "OVERDUE", ...KNOWN_STATUSES].includes(
      status,
    )
  ) {
    throw new Error("Invalid status filter");
  }

  if (status === "FINISHED") {
    filter.status = {
      $in: FINISHED,
    };
  } else if (status === "ACTIVE_WORK") {
    filter.status = {
      $in: ["ASSIGNED", "IN_PROGRESS"],
    };
  } else if (status === "WAITING_MATERIAL") {
    filter.status = {
      $in: WAITING,
    };
  } else if (status === "OVERDUE") {
    filter.deadline = {
      $lt: new Date(),
    };

    filter.status = {
      $nin: FINISHED,
    };
  } else if (status !== "ALL") {
    filter.status = status;
  }

  applied.status = status;

  // ----------------------------------------
  // PRIORITY FILTER
  // ----------------------------------------

  const priority = text(params.priority || "ALL", 25).toUpperCase();

  if (!["ALL", "HIGH_PLUS", ...VALID_PRIORITIES].includes(priority)) {
    throw new Error("Invalid priority filter");
  }

  if (priority === "HIGH_PLUS") {
    filter.priority = {
      $in: ["HIGH", "URGENT"],
    };
  } else if (priority !== "ALL") {
    filter.priority = priority;
  }

  applied.priority = priority;

  // ----------------------------------------
  // AREA FILTER
  // ----------------------------------------

  const area = text(params.area || "ALL", 20).toUpperCase();

  if (!["ALL", ...VALID_AREAS].includes(area)) {
    throw new Error("Invalid area filter");
  }

  if (area !== "ALL") {
    filter.complaintArea = area;
  }

  applied.area = area;

  // ----------------------------------------
  // CATEGORY FILTER
  // ----------------------------------------

  const category = text(params.category || "ALL", 120);

  if (category.toUpperCase() !== "ALL") {
    filter.category = exact(category);
  }

  applied.category = category;

  // ----------------------------------------
  // HOSTEL / BLOCK SCOPE
  // ----------------------------------------

  const scopeType = text(params.scopeType || "ALL", 15).toUpperCase();

  const scopeValue = text(params.scopeValue || "", 120);

  if (!["ALL", "HOSTEL", "BLOCK"].includes(scopeType)) {
    throw new Error("Invalid location scope");
  }

  if (scopeType !== "ALL" && !scopeValue) {
    throw new Error("Hostel or Block code is required");
  }

  if (scopeType === "HOSTEL") {
    if (area !== "ALL" && area !== "HOSTEL") {
      throw new Error("Area conflicts with Hostel selection");
    }

    filter.complaintArea = "HOSTEL";
    filter.hostel = codeReference(scopeValue);
  } else if (scopeType === "BLOCK") {
    if (area !== "ALL" && area !== "DEPARTMENT") {
      throw new Error("Area conflicts with Academic Block selection");
    }

    filter.complaintArea = "DEPARTMENT";
    filter.block = codeReference(scopeValue);
  }

  applied.scope = scopeType === "ALL" ? "ALL" : `${scopeType}: ${scopeValue}`;

  // ----------------------------------------
  // ISSUE LOCATION
  // ----------------------------------------

  const issueLocation = text(params.issueLocation || "ALL", 120);

  if (issueLocation.toUpperCase() !== "ALL") {
    filter.issueLocation = exact(issueLocation);
  }

  applied.issueLocation = issueLocation;

  // ----------------------------------------
  // LEGACY LOCATION FILTER
  // ----------------------------------------

  const legacyLocation = text(params.location || "ALL", 120);

  if (
    legacyLocation.toUpperCase() !== "ALL" &&
    scopeType === "ALL" &&
    issueLocation.toUpperCase() === "ALL"
  ) {
    const match = exact(legacyLocation);

    filter.$and = [
      {
        $or: [{ hostel: match }, { block: match }, { issueLocation: match }],
      },
    ];
  }

  // ----------------------------------------
  // SEARCH
  // ----------------------------------------

  const search = text(params.search || "", 120);

  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");

    filter.$or = [
      { complaintId: pattern },
      { title: pattern },
      { category: pattern },
    ];
  }

  applied.search = search;

  return {
    filter,
    applied,
  };
}

// ==========================================
// REPORT STATISTICS
// ==========================================

function statistics(rows) {
  const count = (predicate) => rows.filter(predicate).length;

  return {
    total: rows.length,

    pending: count((r) => r.status === "PENDING"),

    inProgress: count((r) => ["ASSIGNED", "IN_PROGRESS"].includes(r.status)),

    waitingMaterial: count((r) => WAITING.includes(r.status)),

    completed: count((r) => FINISHED.includes(r.status)),

    highPriority: count((r) => ["HIGH", "URGENT"].includes(r.priority)),

    overdue: count(
      (r) =>
        r.deadline &&
        new Date(r.deadline) < new Date() &&
        !FINISHED.includes(r.status),
    ),
  };
}

// ==========================================
// FORMAT DATE IN IST
// ==========================================

const istDate = (value, withTime = true) => {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",

    day: "2-digit",
    month: "2-digit",
    year: "numeric",

    ...(withTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }
      : {}),
  }).format(new Date(value));
};

// ==========================================
// FORMAT LOCATION
// ==========================================

const place = (row) =>
  [row.hostel || row.block, row.issueLocation, row.roomNumber]
    .filter(Boolean)
    .join(" · ") || "—";

// ==========================================
// GENERATE EXCEL WORKBOOK
// ==========================================

async function generateExcel(rows, stats, applied) {
  const ExcelJS = require("exceljs");

  const workbook = new ExcelJS.Workbook();

  workbook.creator = "AmiMaintain";
  workbook.created = new Date();

  // ----------------------------------------
  // SUMMARY WORKSHEET
  // ----------------------------------------

  const summary = workbook.addWorksheet("Summary");

  summary.columns = [{ width: 28 }, { width: 48 }];

  summary.mergeCells("A1:B1");

  summary.getCell("A1").value = "AMIMAINTAIN | COMPLAINT REPORT";

  summary.getCell("A1").font = {
    bold: true,
    size: 16,

    color: {
      argb: "FFFFFFFF",
    },
  };

  summary.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",

    fgColor: {
      argb: "FF102B52",
    },
  };

  summary.getRow(1).height = 31;

  summary.addRow(["Generated (IST)", istDate(new Date())]);

  for (const [label, key] of [
    ["Start Date", "startDate"],
    ["End Date", "endDate"],
    ["Status", "status"],
    ["Priority", "priority"],
    ["Area", "area"],
    ["Category", "category"],
    ["Hostel / Block", "scope"],
    ["Issue Location", "issueLocation"],
    ["Search", "search"],
  ]) {
    summary.addRow([label, excelValue(applied[key] || "All")]);
  }

  summary.addRow([]);

  for (const [label, number] of Object.entries(stats)) {
    summary.addRow([label.replace(/([A-Z])/g, " $1").toUpperCase(), number]);
  }

  summary.getColumn(1).font = {
    bold: true,

    color: {
      argb: "FF102B52",
    },
  };

  // ----------------------------------------
  // COMPLAINTS WORKSHEET
  // ----------------------------------------

  const sheet = workbook.addWorksheet("Complaints", {
    views: [
      {
        state: "frozen",
        ySplit: 1,
      },
    ],
  });

  sheet.columns = [
    ["Complaint ID", "complaintId", 25],
    ["Created IST", "createdAt", 23],
    ["Title", "title", 35],
    ["Description", "description", 60],
    ["Area", "area", 17],
    ["Category", "category", 25],
    ["Subcategory", "subCategory", 24],
    ["Priority", "priority", 16],
    ["Status", "status", 22],
    ["Hostel", "hostel", 20],
    ["Block", "block", 20],
    ["Floor", "floor", 15],
    ["Room", "room", 18],
    ["Issue Location", "issueLocation", 30],
    ["Reporter", "reporter", 25],
    ["Reporter Role", "reporterRole", 20],
    ["Technician", "technician", 25],
    ["Assigned By", "assignedBy", 25],
    ["Technician Remarks", "remarks", 45],
    ["Deadline IST", "deadline", 23],
    ["Started IST", "started", 23],
    ["Completed IST", "completed", 23],
    ["Verified IST", "verified", 23],
    ["Closed IST", "closed", 23],
    ["Escalated", "escalated", 15],
    ["Escalation Reason", "escalationReason", 42],
    ["Not Satisfied Count", "reopenCount", 20],
    ["Not Satisfied Reason", "reopenReason", 46],
  ].map(([header, key, width]) => ({
    header,
    key,
    width,
  }));

  sheet.getRow(1).height = 26;

  sheet.getRow(1).font = {
    bold: true,

    color: {
      argb: "FFFFFFFF",
    },
  };

  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",

    fgColor: {
      argb: "FF102B52",
    },
  };

  // ----------------------------------------
  // ADD COMPLAINT ROWS
  // ----------------------------------------

  for (const r of rows) {
    sheet.addRow({
      complaintId: excelValue(r.complaintId),

      createdAt: istDate(r.createdAt),

      title: excelValue(r.title),

      description: excelValue(r.description),

      area: excelValue(r.complaintArea),

      category: excelValue(r.category),

      subCategory: excelValue(r.subCategory),

      priority: excelValue(r.priority),

      status: excelValue(r.status),

      hostel: excelValue(r.hostel),

      block: excelValue(r.block),

      floor: excelValue(r.floor),

      room: excelValue(r.roomNumber),

      issueLocation: excelValue(r.issueLocation),

      reporter: excelValue(r.createdBy?.name),

      reporterRole: excelValue(r.createdBy?.role),

      technician: excelValue(r.assignedTo?.name),

      assignedBy: excelValue(r.assignedBy?.name),

      remarks: excelValue(r.workerRemarks),

      deadline: istDate(r.deadline),

      started: istDate(r.startedAt),

      completed: istDate(r.completedAt),

      verified: istDate(r.resolvedAt),

      closed: istDate(r.closedAt),

      escalated: r.isEscalated ? "Yes" : "No",

      escalationReason: excelValue(r.escalationReason),

      reopenCount: r.reopenCount || 0,

      reopenReason: excelValue(r.reopenReason),
    });
  }

  sheet.autoFilter = {
    from: "A1",
    to: "AB1",
  };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// ==========================================
// GENERATE PDF REPORT
// ==========================================

async function generatePdf(rows, stats, applied) {
  const PDFDocument = require("pdfkit");
  const fs = require("fs");

  // ==========================================
  // PDF CONFIGURATION
  // ==========================================

  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: {
      top: 28,
      bottom: 28,
      left: 28,
      right: 28,
    },
    bufferPages: true,
    autoFirstPage: true,
  });

  const chunks = [];

  const completed = new Promise((resolve, reject) => {
    doc.on("data", (chunk) => {
      chunks.push(chunk);
    });

    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    doc.on("error", reject);
  });

  // ==========================================
  // PDF FONT
  // ==========================================

  const customFont = process.env.REPORT_FONT_PATH;

  if (customFont && fs.existsSync(customFont)) {
    doc.font(customFont);
  } else {
    doc.font("Helvetica");
  }

  // ==========================================
  // COLORS
  // ==========================================

  const NAVY = "#102B52";
  const GOLD = "#EAC16A";
  const WHITE = "#FFFFFF";
  const DARK = "#192E4A";
  const MUTED = "#62728A";
  const LIGHT = "#F4F6FA";

  // ==========================================
  // PAGE DIMENSIONS
  // ==========================================

  const MARGIN = 28;

  const PAGE_WIDTH = doc.page.width;
  const PAGE_HEIGHT = doc.page.height;

  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

  const ROW_HEIGHT = 27;
  const HEADER_HEIGHT = 26;

  // Reserve enough space for footer.
  const TABLE_BOTTOM = PAGE_HEIGHT - 70;

  // ==========================================
  // TABLE COLUMNS
  // ==========================================

  const columns = [
    { title: "ID", width: 74 },
    { title: "Date", width: 62 },
    { title: "Title", width: 113 },
    { title: "Category", width: 84 },
    { title: "Location", width: 100 },
    { title: "Priority", width: 57 },
    { title: "Status", width: 90 },
    { title: "Reporter", width: 96 },
    { title: "Technician", width: 83 },
  ];

  // ==========================================
  // SAFE TEXT
  // ==========================================

  const safeText = (value, max = 200) => {
    return (
      String(value ?? "—")
        .replace(/[\x00-\x1F\x7F]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max) || "—"
    );
  };

  // ==========================================
  // FIXED POSITION TEXT
  // Prevents unwanted wrapping/page breaks
  // ==========================================

  const printText = (
    value,
    x,
    y,
    width,
    { fontSize = 8, color = DARK, height = 13, align = "left" } = {},
  ) => {
    doc.fillColor(color).fontSize(fontSize).text(safeText(value), x, y, {
      width,
      height,
      align,
      lineBreak: false,
      ellipsis: true,
    });
  };

  // ==========================================
  // DRAW PAGE TITLE
  // FIRST PAGE ONLY
  // ==========================================

  const drawReportTitle = () => {
    doc.rect(0, 0, PAGE_WIDTH, 72).fill(NAVY);

    printText("AmiMaintain", MARGIN, 16, 350, {
      fontSize: 19,
      color: WHITE,
      height: 26,
    });

    printText("MAINTENANCE COMPLAINT REPORT", MARGIN, 43, 420, {
      fontSize: 10,
      color: GOLD,
    });

    // ======================================
    // REPORT DETAILS
    // ======================================

    printText(
      `Generated (IST): ${istDate(new Date())}`,
      MARGIN,
      83,
      CONTENT_WIDTH,
      {
        fontSize: 9,
        color: MUTED,
      },
    );

    printText(
      `Period: ${applied.startDate || "All"} to ${applied.endDate || "Time"}`,
      MARGIN,
      100,
      CONTENT_WIDTH,
      {
        fontSize: 9,
        color: MUTED,
      },
    );

    printText(
      `Area: ${applied.area || "ALL"} | Hostel / Block: ${applied.scope || "ALL"} | Location: ${applied.issueLocation || "ALL"}`,
      MARGIN,
      117,
      CONTENT_WIDTH,
      {
        fontSize: 8,
        color: MUTED,
      },
    );

    printText(
      `Status: ${applied.status || "ALL"} | Priority: ${applied.priority || "ALL"} | Category: ${applied.category || "ALL"} | Search: ${applied.search || "None"}`,
      MARGIN,
      134,
      CONTENT_WIDTH,
      {
        fontSize: 8,
        color: MUTED,
      },
    );

    // ======================================
    // SUMMARY STATISTICS
    // ======================================

    const summaryItems = [
      ["TOTAL", stats.total],
      ["PENDING", stats.pending],
      ["IN PROGRESS", stats.inProgress],
      ["WAITING", stats.waitingMaterial],
      ["COMPLETED", stats.completed],
      ["HIGH / URGENT", stats.highPriority],
      ["OVERDUE", stats.overdue],
    ];

    const CARD_WIDTH = 105;
    const CARD_GAP = 7;
    const CARD_Y = 159;

    summaryItems.forEach(([label, number], index) => {
      const x = MARGIN + index * (CARD_WIDTH + CARD_GAP);

      doc.roundedRect(x, CARD_Y, CARD_WIDTH, 44, 5).fill(LIGHT);

      printText(String(number ?? 0), x + 9, CARD_Y + 7, CARD_WIDTH - 18, {
        fontSize: 16,
        color: NAVY,
        height: 20,
      });

      printText(label, x + 9, CARD_Y + 30, CARD_WIDTH - 18, {
        fontSize: 7,
        color: MUTED,
        height: 10,
      });
    });
  };

  // ==========================================
  // DRAW TABLE HEADER
  // ==========================================

  const drawTableHeader = (y) => {
    doc.rect(MARGIN, y, CONTENT_WIDTH, HEADER_HEIGHT).fill(NAVY);

    let x = MARGIN;

    columns.forEach((column) => {
      printText(column.title, x + 4, y + 8, column.width - 8, {
        fontSize: 8,
        color: WHITE,
        height: 12,
      });

      x += column.width;
    });

    return y + HEADER_HEIGHT;
  };

  // ==========================================
  // DRAW COMPLAINT ROW
  // ==========================================

  const drawComplaintRow = (row, index, y) => {
    if (index % 2 === 0) {
      doc.rect(MARGIN, y, CONTENT_WIDTH, ROW_HEIGHT).fill(LIGHT);
    }

    const values = [
      row.complaintId || "—",
      istDate(row.createdAt, false),
      row.title || "—",
      row.category || "—",
      place(row),
      row.priority || "—",
      row.status || "—",
      row.createdBy?.name || "—",
      row.assignedTo?.name || "—",
    ];

    let x = MARGIN;

    values.forEach((value, i) => {
      printText(value, x + 4, y + 7, columns[i].width - 8, {
        fontSize: 7.5,
        color: DARK,
        height: 13,
      });

      x += columns[i].width;
    });

    return y + ROW_HEIGHT;
  };

  // ==========================================
  // BUILD FIRST PAGE
  // ==========================================

  drawReportTitle();

  let currentY = drawTableHeader(221);

  // ==========================================
  // NO COMPLAINTS
  // ==========================================

  if (!rows.length) {
    printText(
      "No complaints found for the selected filters.",
      MARGIN + 10,
      currentY + 17,
      CONTENT_WIDTH - 20,
      {
        fontSize: 10,
        color: MUTED,
        height: 18,
      },
    );
  }

  // ==========================================
  // COMPLAINT ROWS + PAGINATION
  // ==========================================

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];

    // Add a page only if the next row
    // cannot fit in the available area.
    if (currentY + ROW_HEIGHT > TABLE_BOTTOM) {
      doc.addPage();

      // Continuation page starts with header.
      currentY = drawTableHeader(42);
    }

    currentY = drawComplaintRow(row, index, currentY);
  }

  // ==========================================
  // CORRECT PAGE FOOTERS
  // ==========================================

  const pageRange = doc.bufferedPageRange();

  const startPage = pageRange.start;
  const totalPages = pageRange.count;

  for (let p = startPage; p < startPage + totalPages; p++) {
    doc.switchToPage(p);

    const footerLineY = PAGE_HEIGHT - 50;

    const footerTextY = PAGE_HEIGHT - 43;

    // Footer line
    doc
      .moveTo(MARGIN, footerLineY)
      .lineTo(PAGE_WIDTH - MARGIN, footerLineY)
      .strokeColor("#C89A45")
      .lineWidth(0.7)
      .stroke();

    // Footer text is now within the
    // printable region, not below margin.
    printText(
      `AmiMaintain | Confidential Admin Report | Page ${p - startPage + 1} of ${totalPages}`,
      MARGIN,
      footerTextY,
      CONTENT_WIDTH,
      {
        fontSize: 7,
        color: MUTED,
        height: 10,
        align: "right",
      },
    );
  }

  // ==========================================
  // COMPLETE PDF
  // ==========================================

  doc.end();

  return completed;
}

// ==========================================
// DOWNLOAD COMPLAINT REPORT
// ==========================================

exports.downloadComplaintReport = async (req, res) => {
  try {
    const format = text(req.query.format, 10).toLowerCase();

    if (!["xlsx", "pdf"].includes(format)) {
      return res.status(400).json({
        success: false,
        message: "format must be xlsx or pdf",
      });
    }

    // --------------------------------------
    // VALIDATE FILTERS
    // --------------------------------------

    let filter;
    let applied;

    try {
      ({ filter, applied } = buildQuery(req.query));
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    // --------------------------------------
    // LIMIT EXPORT SIZE
    // --------------------------------------

    const count = await Complaint.countDocuments(filter);

    const limit = format === "pdf" ? 2500 : 10000;

    if (count > limit) {
      return res.status(413).json({
        success: false,

        message:
          `${count} complaints found. Narrow the period/filters ` +
          `(max ${limit} records per ${format.toUpperCase()} report).`,
      });
    }

    // --------------------------------------
    // FETCH MONGODB COMPLAINTS
    // --------------------------------------

    const rows = await Complaint.find(filter)
      .select(
        "complaintId createdAt title description complaintArea category subCategory priority status hostel block floor roomNumber issueLocation deadline startedAt completedAt resolvedAt closedAt isEscalated escalationReason reopenCount reopenReason workerRemarks createdBy assignedTo assignedBy",
      )
      .populate("createdBy", "name role")
      .populate("assignedTo", "name")
      .populate("assignedBy", "name")
      .sort({
        createdAt: -1,
        _id: -1,
      })
      .lean();

    // --------------------------------------
    // GENERATE REPORT
    // --------------------------------------

    const stats = statistics(rows);

    const file =
      format === "xlsx"
        ? await generateExcel(rows, stats, applied)
        : await generatePdf(rows, stats, applied);

    const filename =
      `AmiMaintain_Complaints_` +
      `${applied.startDate || "All"}_` +
      `${applied.endDate || "Time"}.` +
      format;

    // --------------------------------------
    // SEND DOWNLOAD
    // --------------------------------------

    res.set({
      "Content-Type":
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",

      "Content-Disposition": `attachment; filename="${filename}"`,

      "Cache-Control": "no-store",

      "X-Content-Type-Options": "nosniff",
    });

    return res.status(200).send(file);
  } catch (error) {
    console.error("COMPLAINT REPORT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to generate complaint report",
    });
  }
};

// ==========================================
// INTERNAL TEST HELPERS
// ==========================================

exports._internal = {
  buildQuery,
  statistics,
  midnightIST,
};
