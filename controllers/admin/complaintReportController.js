"use strict";

const Complaint = require("../../models/Complaint");

const FINISHED = ["COMPLETED", "RESOLVED", "CLOSED"];
const WAITING = ["WAITING_MATERIAL", "WAITING_FOR_MATERIAL"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const AREAS = ["HOSTEL", "DEPARTMENT", "CAMPUS"];

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const cleanText = (value, max = 250) =>
  String(value ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ")
    .trim()
    .slice(0, max);

const excelText = (value, max = 2000) => {
  const text = cleanText(value, max);
  return /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
};

// ==========================================
// IST DATE FILTER HELPERS
// ==========================================

function parseDate(value) {
  if (typeof value !== "string") {
    throw new Error("Invalid date parameter");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    throw new Error("Date must be YYYY-MM-DD");
  }

  const [year, month, day] = value.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));

  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new Error("Invalid calendar date");
  }

  return utc;
}

function istMidnight(date, followingDay = false) {
  const copy = new Date(date);
  if (followingDay) copy.setUTCDate(copy.getUTCDate() + 1);

  return new Date(copy.getTime() - 330 * 60 * 1000);
}

// ==========================================
// BACKEND REPORT FILTERS
// ==========================================

function buildQuery(params = {}) {
  const filter = {};
  const applied = {};
  const startProvided = Boolean(params.startDate);
  const endProvided = Boolean(params.endDate);

  if (startProvided !== endProvided) {
    throw new Error("Both startDate and endDate are required");
  }

  if (startProvided) {
    const start = parseDate(params.startDate);
    const end = parseDate(params.endDate);

    if (start > end) {
      throw new Error("End date must be on or after start date");
    }

    filter.createdAt = {
      $gte: istMidnight(start),
      $lt: istMidnight(end, true),
    };

    applied.startDate = params.startDate;
    applied.endDate = params.endDate;
  }

  const status = cleanText(params.status || "ALL", 40).toUpperCase();

  const allowedStatuses = [
    "ALL",
    "FINISHED",
    "ACTIVE_WORK",
    "PENDING",
    "ASSIGNED",
    "IN_PROGRESS",
    "WAITING_MATERIAL",
    "REOPENED",
    ...FINISHED,
  ];

  if (!allowedStatuses.includes(status)) {
    throw new Error("Invalid status filter");
  }

  if (status === "FINISHED") {
    filter.status = { $in: FINISHED };
  } else if (status === "ACTIVE_WORK") {
    filter.status = { $in: ["ASSIGNED", "IN_PROGRESS"] };
  } else if (status === "WAITING_MATERIAL") {
    filter.status = { $in: WAITING };
  } else if (status !== "ALL") {
    filter.status = status;
  }

  applied.status = status;

  const priority = cleanText(params.priority || "ALL", 30).toUpperCase();

  if (!["ALL", "HIGH_PLUS", ...PRIORITIES].includes(priority)) {
    throw new Error("Invalid priority filter");
  }

  if (priority === "HIGH_PLUS") {
    filter.priority = { $in: ["HIGH", "URGENT"] };
  } else if (priority !== "ALL") {
    filter.priority = priority;
  }

  applied.priority = priority;

  const area = cleanText(params.area || "ALL", 30).toUpperCase();

  if (!["ALL", ...AREAS].includes(area)) {
    throw new Error("Invalid complaint area filter");
  }

  if (area !== "ALL") filter.complaintArea = area;
  applied.area = area;

  const category = cleanText(params.category || "ALL", 120);

  if (category && category.toUpperCase() !== "ALL") {
    filter.category = new RegExp(`^${escapeRegex(category)}$`, "i");
  }

  applied.category = category;

  const location = cleanText(params.location || "ALL", 120);

  if (location && location.toUpperCase() !== "ALL") {
    const matches = new RegExp(`^${escapeRegex(location)}$`, "i");

    filter.$and = [
      {
        $or: [
          { hostel: matches },
          { block: matches },
          { issueLocation: matches },
        ],
      },
    ];
  }

  applied.location = location;

  const search = cleanText(params.search || "", 120);

  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");

    filter.$and = [
      ...(filter.$and || []),
      {
        $or: [
          { complaintId: pattern },
          { title: pattern },
          { category: pattern },
        ],
      },
    ];
  }

  applied.search = search;

  return { filter, applied };
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

    reopened: count((r) => r.status === "REOPENED"),

    overdue: count(
      (r) =>
        r.deadline &&
        new Date(r.deadline) < new Date() &&
        !FINISHED.includes(r.status),
    ),
  };
}

const locationText = (row) =>
  [row.hostel || row.block, row.issueLocation, row.roomNumber]
    .filter(Boolean)
    .join(" · ") || "—";

const istDate = (value) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(value))
    : "—";

const istDateTime = (value) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value))
    : "—";

// ==========================================
// EXCEL REPORT
// ==========================================

async function makeExcel(rows, stats, applied) {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "AmiMaintain";
  workbook.title = "AmiMaintain Maintenance Complaint Report";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Summary", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  summary.columns = [{ width: 32 }, { width: 45 }];

  summary.mergeCells("A1:B1");

  summary.getCell("A1").value = "AMIMAINTAIN | COMPLAINT REPORT";

  summary.getCell("A1").font = {
    bold: true,
    size: 16,
    color: { argb: "FFFFFFFF" },
  };

  summary.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF102B52" },
  };

  summary.getRow(1).height = 32;

  summary.addRow(["Generated (IST)", istDateTime(new Date())]);

  summary.addRow(["Start Date", applied.startDate || "All time"]);

  summary.addRow(["End Date", applied.endDate || "All time"]);

  for (const key of [
    "status",
    "priority",
    "area",
    "category",
    "location",
    "search",
  ]) {
    summary.addRow([key.toUpperCase(), excelText(applied[key] || "—")]);
  }

  summary.addRow([]);

  for (const [key, value] of Object.entries(stats)) {
    summary.addRow([key.replace(/([A-Z])/g, " $1").toUpperCase(), value]);
  }

  summary.getColumn(1).font = {
    bold: true,
    color: { argb: "FF102B52" },
  };

  const sheet = workbook.addWorksheet("Complaints", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Complaint ID", key: "complaintId", width: 25 },
    { header: "Created (IST)", key: "createdAt", width: 22 },
    { header: "Title", key: "title", width: 35 },
    { header: "Description", key: "description", width: 55 },
    { header: "Area", key: "area", width: 17 },
    { header: "Category", key: "category", width: 25 },
    { header: "Subcategory", key: "subCategory", width: 24 },
    { header: "Priority", key: "priority", width: 16 },
    { header: "Status", key: "status", width: 24 },
    { header: "Hostel", key: "hostel", width: 20 },
    { header: "Block", key: "block", width: 20 },
    { header: "Floor", key: "floor", width: 16 },
    { header: "Room", key: "room", width: 17 },
    { header: "Issue Location", key: "issueLocation", width: 30 },
    { header: "Reporter", key: "reporter", width: 25 },
    { header: "Reporter Role", key: "reporterRole", width: 18 },
    { header: "Technician", key: "technician", width: 25 },
    { header: "Assigned By", key: "assignedBy", width: 25 },
    { header: "Technician Remarks", key: "remarks", width: 45 },
    { header: "Deadline (IST)", key: "deadline", width: 21 },
    { header: "Started (IST)", key: "started", width: 21 },
    { header: "Completed (IST)", key: "completed", width: 21 },
    { header: "Verified (IST)", key: "resolved", width: 21 },
    { header: "Closed (IST)", key: "closed", width: 21 },
    { header: "Escalated", key: "escalated", width: 16 },
    { header: "Escalation Reason", key: "escalationReason", width: 42 },
    { header: "Not Satisfied Count", key: "reopenCount", width: 21 },
    { header: "Not Satisfied Reason", key: "reopenReason", width: 45 },
  ];

  sheet.getRow(1).height = 28;

  sheet.getRow(1).font = {
    bold: true,
    color: { argb: "FFFFFFFF" },
  };

  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF102B52" },
  };

  for (const row of rows) {
    sheet.addRow({
      complaintId: excelText(row.complaintId),
      createdAt: istDateTime(row.createdAt),
      title: excelText(row.title),
      description: excelText(row.description),
      area: excelText(row.complaintArea),
      category: excelText(row.category),
      subCategory: excelText(row.subCategory),
      priority: excelText(row.priority),
      status: excelText(row.status),
      hostel: excelText(row.hostel),
      block: excelText(row.block),
      floor: excelText(row.floor),
      room: excelText(row.roomNumber),
      issueLocation: excelText(row.issueLocation),
      reporter: excelText(row.createdBy?.name),
      reporterRole: excelText(row.createdBy?.role),
      technician: excelText(row.assignedTo?.name),
      assignedBy: excelText(row.assignedBy?.name),
      remarks: excelText(row.workerRemarks),
      deadline: istDateTime(row.deadline),
      started: istDateTime(row.startedAt),
      completed: istDateTime(row.completedAt),
      resolved: istDateTime(row.resolvedAt),
      closed: istDateTime(row.closedAt),
      escalated: row.isEscalated ? "Yes" : "No",
      escalationReason: excelText(row.escalationReason),
      reopenCount: row.reopenCount || 0,
      reopenReason: excelText(row.reopenReason),
    });
  }

  sheet.autoFilter = {
    from: "A1",
    to: "AB1",
  };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// ==========================================
// PDF REPORT
// ==========================================

async function makePdf(rows, stats, applied) {
  const PDFDocument = require("pdfkit");
  const fs = require("fs");

  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 28,
    bufferPages: true,
  });

  const chunks = [];

  const finished = new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const regularFont = process.env.REPORT_FONT_PATH;

  if (regularFont && fs.existsSync(regularFont)) {
    doc.font(regularFont);
  } else {
    doc.font("Helvetica");
  }

  const navy = "#102B52";
  const gold = "#C79A44";
  const ink = "#172B49";
  const muted = "#66758B";
  const margin = 28;
  const pageWidth = doc.page.width - margin * 2;

  const cols = [74, 62, 113, 84, 100, 57, 90, 96, 83];

  const titles = [
    "ID",
    "Date",
    "Title",
    "Category",
    "Location",
    "Priority",
    "Status",
    "Reporter",
    "Technician",
  ];

  const drawTitle = () => {
    doc.rect(0, 0, doc.page.width, 72).fill(navy);

    doc.fillColor("#FFFFFF").fontSize(17).text("AmiMaintain", margin, 16);

    doc
      .fillColor("#F3D391")
      .fontSize(10)
      .text("MAINTENANCE COMPLAINT REPORT", margin, 39);

    doc.fillColor(ink).fontSize(9);
  };

  const header = (y) => {
    doc.rect(margin, y, pageWidth, 24).fill(navy);

    let x = margin;

    for (let i = 0; i < cols.length; i += 1) {
      doc
        .fillColor("#FFFFFF")
        .fontSize(8)
        .text(titles[i], x + 4, y + 7, {
          width: cols[i] - 7,
          lineBreak: false,
        });

      x += cols[i];
    }

    return y + 24;
  };

  drawTitle();

  doc
    .fillColor(muted)
    .fontSize(9)
    .text(`Generated: ${istDateTime(new Date())} IST`, margin, 83)
    .text(
      `Period: ${applied.startDate || "All time"} to ${applied.endDate || "All time"}`,
      margin,
      100,
    );

  doc.text(
    `Filters: Status ${applied.status} | Priority ${applied.priority} | Area ${applied.area} | Category ${applied.category || "ALL"} | Location ${applied.location || "ALL"}`,
    margin,
    117,
    { width: pageWidth },
  );

  doc.text(`Search: ${applied.search || "None"}`, margin, 132);

  const statPairs = [
    ["TOTAL", stats.total],
    ["PENDING", stats.pending],
    ["IN PROGRESS", stats.inProgress],
    ["WAITING", stats.waitingMaterial],
    ["COMPLETED", stats.completed],
    ["HIGH/URGENT", stats.highPriority],
    ["OVERDUE", stats.overdue],
  ];

  let sx = margin;

  for (const [label, count] of statPairs) {
    doc.roundedRect(sx, 153, 105, 43, 5).fill("#F3F6FA");

    doc
      .fillColor(navy)
      .fontSize(15)
      .text(String(count), sx + 9, 159);

    doc
      .fillColor(muted)
      .fontSize(7.5)
      .text(label, sx + 9, 179);

    sx += 112;
  }

  let y = header(211);

  if (!rows.length) {
    doc
      .fillColor(muted)
      .fontSize(11)
      .text("No complaints match the selected filters.", margin, y + 15);
  }

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];

    if (y + 26 > doc.page.height - 38) {
      doc.addPage();
      y = header(40);
    }

    if (i % 2 === 0) {
      doc.rect(margin, y, pageWidth, 26).fill("#F5F7FA");
    }

    const cells = [
      row.complaintId,
      istDate(row.createdAt),
      row.title,
      row.category,
      locationText(row),
      row.priority,
      row.status,
      row.createdBy?.name,
      row.assignedTo?.name,
    ];

    let x = margin;

    for (let col = 0; col < cols.length; col += 1) {
      const cell = cleanText(cells[col] || "—", 150);

      doc
        .fillColor(ink)
        .fontSize(7.5)
        .text(cell, x + 4, y + 6, {
          width: cols[col] - 7,
          height: 18,
          ellipsis: true,
        });

      x += cols[col];
    }

    y += 26;
  }

  const pageCount = doc.bufferedPageRange().count;

  for (let page = 0; page < pageCount; page += 1) {
    doc.switchToPage(page);

    doc
      .fillColor(muted)
      .fontSize(7)
      .text(
        `AmiMaintain | Confidential administrator report | Page ${page + 1} / ${pageCount}`,
        margin,
        doc.page.height - 24,
        {
          width: pageWidth,
          align: "right",
        },
      );

    doc
      .moveTo(margin, doc.page.height - 28)
      .lineTo(doc.page.width - margin, doc.page.height - 28)
      .strokeColor(gold)
      .stroke();
  }

  doc.end();
  return finished;
}

// ==========================================
// DOWNLOAD COMPLAINT REPORT
// ADMIN ONLY
// ==========================================

exports.downloadComplaintReport = async (req, res) => {
  try {
    const format = String(req.query.format || "").toLowerCase();

    if (!["xlsx", "pdf"].includes(format)) {
      return res.status(400).json({
        success: false,
        message: "format must be xlsx or pdf",
      });
    }

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

    const limit = format === "pdf" ? 2500 : 10000;
    const count = await Complaint.countDocuments(filter);

    if (count > limit) {
      return res.status(413).json({
        success: false,

        message:
          `Found ${count} records. Narrow the date range or filters; ` +
          `${format.toUpperCase()} exports allow up to ${limit} rows.`,
      });
    }

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

    const stats = statistics(rows);

    const buffer =
      format === "xlsx"
        ? await makeExcel(rows, stats, applied)
        : await makePdf(rows, stats, applied);

    const name =
      `AmiMaintain_Complaints_${applied.startDate || "All"}_` +
      `${applied.endDate || "Time"}.${format}`;

    res.set({
      "Content-Type":
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",

      "Content-Disposition": `attachment; filename="${name}"`,

      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });

    return res.status(200).send(buffer);
  } catch (error) {
    console.error("COMPLAINT REPORT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to generate complaint report",
    });
  }
};

exports._internal = {
  buildQuery,
  statistics,
  istMidnight,
};
