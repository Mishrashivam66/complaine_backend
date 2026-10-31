"use strict";

const mongoose = require("mongoose");
const Complaint = require("../../models/Complaint");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const { Parser } = require("json2csv");

// =======================================================
// AMI MAINT. — PROFESSIONAL REPORT EXPORTS
// Single-sheet Excel + Compact PDF + CSV + Analytics
// =======================================================

const IST = 330 * 60 * 1000;
const TZ = "Asia/Kolkata";
const MAX_ROWS = 20000;
const NAVY = "102B52";
const GOLD = "D6AD59";

const str = (v) => String(v ?? "").trim();
const up = (v) => str(v).toUpperCase();
const getId = (v) => str(v?._id || v);
const safe = (v) => (/^[=+\-@\t\r]/.test(str(v)) ? "'" + str(v) : str(v));

const name = (v) => (v && typeof v === "object" ? str(v.name) : "");

function dateKey(value = new Date()) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const part = (type) => parts.find((p) => p.type === type)?.value || "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateText(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function shift(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayStart(day) {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - IST);
}

function validateDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function periodOf(q) {
  const period = up(q.period || "ALL");
  const today = dateKey();
  let from = str(q.fromDate || q.from);
  let to = str(q.toDate || q.to);

  if (period === "TODAY") {
    from = today;
    to = today;
  } else if (period === "YESTERDAY") {
    from = shift(today, -1);
    to = from;
  } else if (period === "WEEK") {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    from = shift(today, -((weekday + 6) % 7));
    to = today;
  } else if (period === "MONTH") {
    from = today.slice(0, 7) + "-01";
    to = today;
  } else if (period === "YEAR") {
    from = today.slice(0, 4) + "-01-01";
    to = today;
  } else if (!["ALL", "CUSTOM"].includes(period)) {
    throw Object.assign(new Error("Invalid reporting period"), { status: 400 });
  }

  if (
    (from && !validateDay(from)) ||
    (to && !validateDay(to)) ||
    (from && to && from > to)
  ) {
    throw Object.assign(new Error("Invalid date range"), { status: 400 });
  }

  return { period, from, to };
}

function locationOf(c) {
  const area = up(c.complaintArea);

  if (area === "HOSTEL" || (!area && c.hostel)) {
    const raw =
      typeof c.hostel === "object"
        ? c.hostel?.hostelCode || c.hostel?.hostelName || c.hostel?.name
        : c.hostel;

    return (
      up(raw)
        .replace(/^(BOYS|GIRLS|STAFF)?\s*HOSTEL[\s-]*/i, "")
        .trim() || "UNSPECIFIED HOSTEL"
    );
  }

  if (area === "DEPARTMENT" || (!area && c.block)) {
    return up(c.block) || "UNSPECIFIED DEPARTMENT BLOCK";
  }

  if (area === "CAMPUS") {
    return (
      up(str(c.issueLocation).split(" - ")[0]) || "UNSPECIFIED CAMPUS LOCATION"
    );
  }

  return "UNSPECIFIED LOCATION";
}

function resolved(c) {
  return ["RESOLVED", "CLOSED"].includes(up(c.status));
}

function overdue(c, now) {
  if (resolved(c) || !c.deadline) return false;
  const d = new Date(c.deadline).getTime();
  return Number.isFinite(d) && d < now;
}

function group(records, field) {
  const map = new Map();

  records.forEach((item) => {
    const key = str(field(item)) || "UNKNOWN";
    map.set(key, (map.get(key) || 0) + 1);
  });

  return [...map]
    .map(([_id, total]) => ({ _id, total }))
    .sort((a, b) => b.total - a.total);
}

function escapeRegex(v) {
  return str(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function loadData(req) {
  const period = periodOf(req.query);
  const q = {};

  if (period.from || period.to) {
    q.createdAt = {};
    if (period.from) q.createdAt.$gte = dayStart(period.from);
    if (period.to) {
      q.createdAt.$lt = dayStart(shift(period.to, 1));
    }
  }

  for (const field of ["category", "status", "priority"]) {
    const value = str(req.query[field]);
    if (value && up(value) !== "ALL") {
      q[field] = new RegExp(`^${escapeRegex(value)}$`, "i");
    }
  }

  const technician = str(req.query.technician);
  if (technician && up(technician) !== "ALL") {
    if (!mongoose.isValidObjectId(technician)) {
      throw Object.assign(new Error("Invalid Technician ID"), { status: 400 });
    }
    q.assignedTo = technician;
  }

  const records = await Complaint.find(q)
    .populate("createdBy", "name")
    .populate("assignedTo", "name department employeeId")
    .populate("assignedBy", "name")
    .sort({ createdAt: -1, _id: -1 })
    .limit(MAX_ROWS + 1)
    .lean();

  if (records.length > MAX_ROWS) {
    throw Object.assign(
      new Error("Too many records. Select a shorter date range."),
      { status: 413 },
    );
  }

  const location = str(req.query.location || "ALL");
  const search = str(req.query.search).toLowerCase();

  const complaints = records.filter((c) => {
    const matchLocation =
      up(location) === "ALL" ||
      up(locationOf(c)).replace(/[^A-Z0-9]/g, "") ===
        up(location).replace(/[^A-Z0-9]/g, "");

    const searchable = [
      c.complaintId,
      c.title,
      c.description,
      c.category,
      locationOf(c),
      c.roomNumber,
      c.issueLocation,
      name(c.createdBy),
      name(c.assignedTo),
    ]
      .map((v) => str(v).toLowerCase())
      .join(" ");

    return matchLocation && (!search || searchable.includes(search));
  });

  return {
    complaints,
    period,
    filters: {
      location,
      category: req.query.category || "ALL",
      status: req.query.status || "ALL",
      priority: req.query.priority || "ALL",
      technician: technician || "ALL",
      search: req.query.search || "",
    },
  };
}

function analytics(list) {
  const now = Date.now();
  const count = (fn) => list.filter(fn).length;

  const total = list.length;
  const solved = count(resolved);

  const workers = new Map();

  list.forEach((c) => {
    const worker = c.assignedTo;
    if (!worker) return;

    const workerId = getId(worker);
    if (!workers.has(workerId)) {
      workers.set(workerId, {
        workerId,
        name: name(worker),
        department: str(worker.department),
        totalJobs: 0,
        completedJobs: 0,
        efficiency: 0,
      });
    }

    const record = workers.get(workerId);
    record.totalJobs++;

    if (resolved(c) || up(c.status) === "COMPLETED") {
      record.completedJobs++;
    }
  });

  const workerEfficiency = [...workers.values()]
    .map((w) => ({
      ...w,
      efficiency: w.totalJobs
        ? Number(((w.completedJobs / w.totalJobs) * 100).toFixed(2))
        : 0,
    }))
    .sort((a, b) => b.efficiency - a.efficiency);

  const locationData = group(list, locationOf);

  return {
    totalComplaints: total,
    resolvedComplaints: solved,
    pendingComplaints: count((c) => up(c.status) === "PENDING"),
    assignedComplaints: count((c) => up(c.status) === "ASSIGNED"),
    inProgressComplaints: count((c) => up(c.status) === "IN_PROGRESS"),
    waitingMaterial: count((c) => up(c.status) === "WAITING_MATERIAL"),
    completedWork: count((c) => up(c.status) === "COMPLETED"),
    activeComplaints: count((c) => !resolved(c)),
    currentlyReopened: count((c) => up(c.status) === "REOPENED"),
    reopenedCases: count((c) => Number(c.reopenCount || 0) > 0),
    totalReopenEvents: list.reduce(
      (sum, c) => sum + Number(c.reopenCount || 0),
      0,
    ),
    overdueIssues: count((c) => overdue(c, now)),
    materialRequired: count((c) => c.materialRequired === true),
    resolutionRate: total ? Number(((solved / total) * 100).toFixed(2)) : 0,
    todayComplaints: count((c) => dateKey(c.createdAt) === dateKey()),
    monthlyComplaints: count((c) =>
      dateKey(c.createdAt).startsWith(dateKey().slice(0, 7)),
    ),
    buildingData: locationData,
    locationData,
    categoryData: group(list, (c) => up(c.category)),
    statusData: group(list, (c) => up(c.status)),
    priorityData: group(list, (c) => up(c.priority)),
    dailyData: group(list, (c) => dateKey(c.createdAt)),
    workerEfficiency,
    topWorker: workerEfficiency[0] || null,
  };
}

function reportRows(complaints) {
  return complaints.map((c, i) => ({
    "S.No": i + 1,
    "Complaint ID": c.complaintId || "",
    "Registered Date": dateText(c.createdAt),
    "Complaint Area": c.complaintArea || "",
    Location: locationOf(c),
    Hostel: typeof c.hostel === "string" ? c.hostel : "",
    Block: c.block || "",
    Floor: c.floor || "",
    Room: c.roomNumber || "",
    "Issue Location": c.issueLocation || "",
    Category: c.category || "",
    Title: c.title || "",
    Description: c.description || "",
    Priority: c.priority || "",
    Status: c.status || "",
    Student: name(c.createdBy),
    Technician: name(c.assignedTo),
    "Assigned By": name(c.assignedBy),
    "Assigned Date": dateText(c.assignedAt),
    "Work Started": dateText(c.startedAt),
    "Work Done": dateText(c.completedAt),
    "Resolved Date": dateText(c.resolvedAt),
    Deadline: dateText(c.deadline),
    Overdue: overdue(c, Date.now()) ? "YES" : "NO",
    "Material Required":
      c.materialRequired === true
        ? "YES"
        : c.materialRequired === false
          ? "NO"
          : "NOT SET",
    "Material Decision": c.materialDecision || "",
    "Student Decision": c.studentVerification?.decision || "",
    "Student Reason": c.studentVerification?.reason || c.reopenReason || "",
    "Student Verification Date": dateText(c.studentVerification?.verifiedAt),
    "Reopen Count": Number(c.reopenCount || 0),
    "Technician Remarks": c.workerRemarks || "",
  }));
}

function handleError(res, error, operation) {
  console.error(`REPORT ${operation} ERROR:`, error);
  if (res.headersSent) {
    res.destroy(error);
    return;
  }

  const status = error.status || 500;
  res.status(status).json({
    success: false,
    message: status === 500 ? `${operation} failed` : error.message,
  });
}

// =======================================================
// GET REPORTS
// =======================================================

exports.getReports = async (req, res) => {
  try {
    const data = await loadData(req);

    res.json({
      success: true,
      report: analytics(data.complaints),
      period: data.period,
      filters: data.filters,
      count: data.complaints.length,
    });
  } catch (error) {
    handleError(res, error, "Load");
  }
};

// =======================================================
// SINGLE-SHEET PROFESSIONAL EXCEL
// =======================================================

exports.exportExcelReport = async (req, res) => {
  try {
    const data = await loadData(req);
    const stats = analytics(data.complaints);
    const rows = reportRows(data.complaints);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "AMI MAINT.";
    workbook.title = "Maintenance Operations Report";

    // ONE sheet instead of scattered tabs.
    const ws = workbook.addWorksheet("Complete Report", {
      views: [
        {
          state: "frozen",
          xSplit: 2,
          ySplit: 10,
          activeCell: "C11",
        },
      ],
      properties: {
        defaultRowHeight: 19,
        pageSetup: {
          orientation: "landscape",
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
        },
      },
    });

    const headers = Object.keys(
      rows[0] ||
        reportRows([
          {
            _id: "",
            status: "",
          },
        ])[0],
    );

    const width = headers.length;

    ws.mergeCells(1, 1, 2, width);
    const title = ws.getCell(1, 1);
    title.value = "AMI MAINT. | MAINTENANCE OPERATIONS REPORT";
    title.font = {
      name: "Calibri",
      size: 21,
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    title.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${NAVY}` },
    };
    title.alignment = {
      vertical: "middle",
      horizontal: "left",
      indent: 1,
    };

    ws.getRow(1).height = 27;
    ws.getRow(2).height = 22;

    ws.mergeCells(3, 1, 3, width);
    const subtitle = ws.getCell(3, 1);
    subtitle.value =
      `Period: ${data.period.from || "All Time"} to ` +
      `${data.period.to || "All Time"}    |    ` +
      `Location: ${data.filters.location}    |    ` +
      `Category: ${data.filters.category}`;
    subtitle.font = {
      name: "Calibri",
      bold: true,
      color: { argb: `FF${NAVY}` },
      size: 11,
    };
    subtitle.alignment = { indent: 1, vertical: "middle" };
    ws.getRow(3).height = 26;

    ws.mergeCells(4, 1, 4, width);
    ws.getCell(4, 1).value =
      `Generated: ${dateText(new Date())}    |    ` +
      `Status: ${data.filters.status}    |    ` +
      `Priority: ${data.filters.priority}`;
    ws.getCell(4, 1).font = {
      size: 10,
      color: { argb: "FF64748B" },
    };
    ws.getCell(4, 1).alignment = { indent: 1 };
    ws.getRow(4).height = 22;

    // Compact KPI strip.
    const metrics = [
      ["TOTAL", stats.totalComplaints],
      ["PENDING", stats.pendingComplaints],
      ["IN PROGRESS", stats.inProgressComplaints],
      ["WORK DONE", stats.completedWork],
      ["RESOLVED", stats.resolvedComplaints],
      ["REOPENED", stats.currentlyReopened],
      ["OVERDUE", stats.overdueIssues],
      ["MATERIAL", stats.materialRequired],
    ];

    metrics.forEach(([label, value], i) => {
      const col = i * 2 + 1;
      const header = ws.getCell(6, col);
      const figure = ws.getCell(7, col);

      ws.mergeCells(6, col, 6, col + 1);
      ws.mergeCells(7, col, 7, col + 1);

      header.value = label;
      figure.value = value;

      header.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: `FF${NAVY}` },
      };
      header.font = {
        bold: true,
        color: { argb: "FFFFFFFF" },
        size: 10,
      };
      header.alignment = { horizontal: "center" };

      figure.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF6F0E2" },
      };
      figure.font = {
        bold: true,
        color: { argb: `FF${NAVY}` },
        size: 16,
      };
      figure.alignment = { horizontal: "center" };
    });

    ws.getRow(6).height = 22;
    ws.getRow(7).height = 34;

    ws.mergeCells(9, 1, 9, width);
    ws.getCell(9, 1).value = "DETAILED COMPLAINT REGISTER";
    ws.getCell(9, 1).font = {
      bold: true,
      size: 12,
      color: { argb: `FF${NAVY}` },
    };
    ws.getRow(9).height = 25;

    // Row 10 = headers. Row 11 onward = every complaint.
    headers.forEach((column, i) => {
      const cell = ws.getCell(10, i + 1);
      cell.value = column;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: `FF${NAVY}` },
      };
      cell.font = {
        name: "Calibri",
        bold: true,
        color: { argb: "FFFFFFFF" },
        size: 10,
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: "left",
        wrapText: true,
      };
      cell.border = {
        bottom: {
          style: "medium",
          color: { argb: `FF${GOLD}` },
        },
      };
    });

    ws.getRow(10).height = 32;

    rows.forEach((record, index) => {
      const rowNumber = index + 11;
      const row = ws.getRow(rowNumber);

      headers.forEach((column, i) => {
        const value = record[column];
        const cell = row.getCell(i + 1);
        cell.value = typeof value === "string" ? safe(value) : (value ?? "");
        cell.font = {
          name: "Calibri",
          size: 10,
          color: { argb: `FF${NAVY}` },
        };
        cell.alignment = {
          vertical: "top",
          wrapText: true,
        };

        if (index % 2 === 1) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF3F6FA" },
          };
        }
      });

      row.height = 30;
    });

    ws.columns = headers.map((header) => ({
      width: ["Description", "Student Reason", "Technician Remarks"].includes(
        header,
      )
        ? 48
        : ["Title", "Issue Location"].includes(header)
          ? 32
          : [
                "Complaint ID",
                "Registered Date",
                "Student Verification Date",
              ].includes(header)
            ? 24
            : ["Student", "Technician", "Location"].includes(header)
              ? 23
              : 19,
    }));

    ws.autoFilter = {
      from: { row: 10, column: 1 },
      to: {
        row: Math.max(11, rows.length + 10),
        column: width,
      },
    };

    ws.pageSetup.printTitlesRow = "1:10";

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="AMI_MAINTENANCE_COMPLETE_${dateKey()}.xlsx"`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    handleError(res, error, "Excel export");
  }
};

// =======================================================
// PROFESSIONAL COMPACT PDF
// =======================================================

/* ==========================================================
   AMI MAINT. — COMPLETE DETAILED PDF REPORT
   Uses SAME reportRows() data as Excel
   Full fields | Safe pagination | No intentional blank pages
   ========================================================== */

exports.exportPDFReport = async (req, res) => {
  try {
    const data = await loadData(req);
    const stats = analytics(data.complaints);

    // SAME ROW DATA AS EXCEL
    const records = reportRows(data.complaints);

    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 0,
      autoFirstPage: false,
      bufferPages: true,
      compress: true,
    });

    const PW = 841.89;
    const PH = 595.28;

    const LEFT = 32;
    const RIGHT = 32;
    const CONTENT_W = PW - LEFT - RIGHT;
    const BOTTOM = PH - 48;

    const NAVY = "#102B52";
    const GOLD = "#D6AD59";
    const INK = "#1A3556";
    const MUTED = "#64748B";
    const LIGHT = "#F3F6FA";
    const LINE = "#E2E8F0";

    let y = 76;
    let sectionPages = 0;

    const asText = (value) => {
      if (value === null || value === undefined) return "";

      return String(value).replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
    };

    // ------------------------------------------------------
    // SAFE ABSOLUTE TEXT DRAWING
    // ------------------------------------------------------

    function drawLine(value, x, top, width, options = {}) {
      const fontSize = options.size || 8;

      doc
        .font(options.bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(fontSize)
        .fillColor(options.color || INK)
        .text(asText(value), x, top, {
          width,
          height: options.height || fontSize + 4,
          lineBreak: false,
          align: options.align || "left",
        });
    }

    // ------------------------------------------------------
    // NEW PAGE
    // ------------------------------------------------------

    function newPage(title = "Detailed Maintenance Report") {
      doc.addPage({
        size: "A4",
        layout: "landscape",
        margin: 0,
      });

      sectionPages += 1;

      doc.rect(0, 0, PW, 62).fill(NAVY);
      doc.rect(0, 62, PW, 3).fill(GOLD);

      drawLine("AMI MAINT.", LEFT, 11, 350, {
        size: 10,
        bold: true,
        color: GOLD,
      });

      drawLine(title, LEFT, 29, CONTENT_W, {
        size: 17,
        bold: true,
        color: "#FFFFFF",
        height: 24,
      });

      y = 78;
    }

    function ensureSpace(height) {
      if (y + height > BOTTOM) {
        newPage("Maintenance Report — Continued");
      }
    }

    // ------------------------------------------------------
    // PRE-WRAP TEXT INTO LINES
    // Prevents cutting off long descriptions and remarks
    // ------------------------------------------------------

    function wrapText(value, width, size = 8) {
      const content = asText(value) || "—";

      doc.font("Helvetica").fontSize(size);

      const result = [];

      for (const paragraph of content.split("\n")) {
        if (!paragraph) {
          result.push("");
          continue;
        }

        let current = "";

        // Split long words too, so no data is lost.
        const tokens = paragraph.match(/\S+|\s+/g) || [];

        for (const token of tokens) {
          const candidate = current + token;

          if (doc.widthOfString(candidate) <= width) {
            current = candidate;
            continue;
          }

          if (current.trim()) {
            result.push(current.trimEnd());
            current = "";
          }

          // Token itself may be longer than column width.
          let fragment = "";

          for (const character of token) {
            if (fragment && doc.widthOfString(fragment + character) > width) {
              result.push(fragment);
              fragment = character;
            } else {
              fragment += character;
            }
          }

          current = fragment;
        }

        if (current.trim()) {
          result.push(current.trimEnd());
        }
      }

      return result.length ? result : ["—"];
    }

    // ------------------------------------------------------
    // REPORT TITLE AND FILTER INFORMATION
    // ------------------------------------------------------

    newPage("Complete Maintenance Operations Report");

    drawLine(`Generated: ${dateText(new Date())}`, LEFT, y, CONTENT_W, {
      size: 9,
      color: MUTED,
    });

    y += 20;

    const filterText = [
      `Period: ${data.period.from || "All Time"} to ${
        data.period.to || "All Time"
      }`,
      `Location: ${data.filters.location}`,
      `Category: ${data.filters.category}`,
      `Status: ${data.filters.status}`,
      `Priority: ${data.filters.priority}`,
    ];

    for (const line of filterText) {
      drawLine(line, LEFT, y, CONTENT_W, {
        size: 9,
      });
      y += 18;
    }

    y += 9;

    // ------------------------------------------------------
    // COMPACT EXECUTIVE SUMMARY
    // ------------------------------------------------------

    ensureSpace(115);

    drawLine("EXECUTIVE SUMMARY", LEFT, y, CONTENT_W, {
      size: 12,
      bold: true,
      color: NAVY,
    });

    y += 24;

    const metrics = [
      ["Total", stats.totalComplaints],
      ["Pending", stats.pendingComplaints],
      ["Assigned", stats.assignedComplaints],
      ["In Progress", stats.inProgressComplaints],
      ["Work Done", stats.completedWork],
      ["Resolved", stats.resolvedComplaints],
      ["Reopened", stats.currentlyReopened],
      ["Overdue", stats.overdueIssues],
    ];

    const gap = 7;
    const cardWidth = (CONTENT_W - gap * (metrics.length - 1)) / metrics.length;

    metrics.forEach(([label, value], index) => {
      const x = LEFT + index * (cardWidth + gap);

      doc.roundedRect(x, y, cardWidth, 58, 5).fill(LIGHT);

      drawLine(value, x + 5, y + 10, cardWidth - 10, {
        size: 16,
        bold: true,
        align: "center",
      });

      drawLine(label.toUpperCase(), x + 4, y + 38, cardWidth - 8, {
        size: 7,
        bold: true,
        color: MUTED,
        align: "center",
      });
    });

    y += 73;

    drawLine(
      `Resolution Rate: ${stats.resolutionRate}%` +
        `    |    Material Required: ${stats.materialRequired}` +
        `    |    Total Reopen Events: ${stats.totalReopenEvents}`,
      LEFT,
      y,
      CONTENT_W,
      { size: 9, color: MUTED },
    );

    y += 28;

    // ------------------------------------------------------
    // COMPLETE COMPLAINT DETAILS
    //
    // Every key in reportRows() is included.
    // Two columns, wrapped values, automatic continuation.
    // ------------------------------------------------------

    const COLUMN_GAP = 12;
    const COL_W = (CONTENT_W - COLUMN_GAP) / 2;

    const LABEL_W = 119;
    const VALUE_W = COL_W - LABEL_W - 20;

    const lineHeight = 11.5;
    const minRowHeight = 25;

    function drawDetailCell(label, lines, x, top, rowHeight, continued) {
      drawLine(
        continued ? `${label} (cont.)` : label,
        x + 8,
        top + 7,
        LABEL_W - 10,
        {
          size: 7.6,
          bold: true,
          color: MUTED,
          height: 13,
        },
      );

      lines.forEach((line, index) => {
        drawLine(line, x + LABEL_W, top + 7 + index * lineHeight, VALUE_W, {
          size: 8,
          color: INK,
          height: lineHeight,
        });
      });
    }

    function drawPair(leftField, rightField) {
      const leftLines = leftField ? wrapText(leftField[1], VALUE_W, 8) : [];

      const rightLines = rightField ? wrapText(rightField[1], VALUE_W, 8) : [];

      let offset = 0;
      const maxLines = Math.max(leftLines.length, rightLines.length, 1);

      // A long value can span multiple pages without
      // deleting any of its lines.
      while (offset < maxLines) {
        if (y + minRowHeight > BOTTOM) {
          newPage("Complaint Details — Continued");
        }

        const available = BOTTOM - y - 14;

        const canFit = Math.max(1, Math.floor(available / lineHeight));

        const take = Math.min(canFit, maxLines - offset);

        const leftPart = leftLines.slice(offset, offset + take);

        const rightPart = rightLines.slice(offset, offset + take);

        const rowHeight = Math.max(minRowHeight, 14 + take * lineHeight);

        if (y + rowHeight > BOTTOM) {
          newPage("Complaint Details — Continued");
          continue;
        }

        doc.rect(LEFT, y, CONTENT_W, rowHeight).fill(LIGHT);

        drawDetailCell(
          leftField?.[0] || "",
          leftPart,
          LEFT,
          y,
          rowHeight,
          offset > 0,
        );

        if (rightField) {
          drawDetailCell(
            rightField[0],
            rightPart,
            LEFT + COL_W + COLUMN_GAP,
            y,
            rowHeight,
            offset > 0,
          );
        }

        doc
          .moveTo(LEFT, y + rowHeight)
          .lineTo(LEFT + CONTENT_W, y + rowHeight)
          .strokeColor(LINE)
          .lineWidth(0.35)
          .stroke();

        y += rowHeight + 3;
        offset += take;
      }
    }

    // ------------------------------------------------------
    // EACH COMPLAINT — COMPLETE EXCEL-EQUIVALENT RECORD
    // ------------------------------------------------------

    records.forEach((record, index) => {
      const fields = Object.entries(record);

      const complaintId = record["Complaint ID"] || `Record ${index + 1}`;

      ensureSpace(60);

      // Complaint title bar.
      doc.roundedRect(LEFT, y, CONTENT_W, 32, 4).fill(NAVY);

      drawLine(
        `${index + 1}. COMPLAINT ${complaintId}`,
        LEFT + 12,
        y + 9,
        CONTENT_W - 190,
        {
          size: 11,
          bold: true,
          color: "#FFFFFF",
        },
      );

      drawLine(
        `${index + 1} / ${records.length}`,
        LEFT + CONTENT_W - 145,
        y + 10,
        130,
        {
          size: 8,
          bold: true,
          color: GOLD,
          align: "right",
        },
      );

      y += 39;

      // Same columns as Excel; no field is omitted.
      for (let i = 0; i < fields.length; i += 2) {
        drawPair(fields[i], fields[i + 1] || null);
      }

      y += 13;
    });

    if (!records.length) {
      ensureSpace(42);

      drawLine(
        "No matching complaints found for the selected filters.",
        LEFT,
        y,
        CONTENT_W,
        {
          size: 11,
          color: MUTED,
        },
      );

      y += 35;
    }

    // ------------------------------------------------------
    // FOOTER — FIXED POSITION, NO AUTOMATIC PAGE BREAK
    // ------------------------------------------------------

    const pageRange = doc.bufferedPageRange();
    const totalPages = pageRange.count;

    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(pageRange.start + i);

      const fy = PH - 32;

      doc
        .moveTo(LEFT, fy)
        .lineTo(PW - RIGHT, fy)
        .strokeColor(LINE)
        .lineWidth(0.5)
        .stroke();

      drawLine(
        "AMI MAINT. | CONFIDENTIAL MAINTENANCE REPORT",
        LEFT,
        fy + 8,
        470,
        {
          size: 7.5,
          color: MUTED,
          height: 12,
        },
      );

      drawLine(
        `Page ${i + 1} of ${totalPages}`,
        PW - RIGHT - 115,
        fy + 8,
        115,
        {
          size: 7.5,
          color: MUTED,
          height: 12,
          align: "right",
        },
      );
    }

    // ------------------------------------------------------
    // SEND PDF
    // ------------------------------------------------------

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="AMI_MAINTENANCE_DETAILED_${dateKey()}.pdf"`,
    );

    doc.pipe(res);
    doc.end();
  } catch (error) {
    handleError(res, error, "PDF export");
  }
};

// =======================================================
// CSV EXPORT — SAME DETAILED FIELDS
// =======================================================

exports.exportCSVReport = async (req, res) => {
  try {
    const data = await loadData(req);
    const rows = reportRows(data.complaints);

    const fields = Object.keys(rows[0] || reportRows([{ status: "" }])[0]);

    const parser = new Parser({ fields });

    const csv = parser.parse(
      rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            typeof value === "string" ? safe(value) : value,
          ]),
        ),
      ),
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="AMI_MAINTENANCE_COMPLETE_${dateKey()}.csv"`,
    );

    res.send("\uFEFF" + csv);
  } catch (error) {
    handleError(res, error, "CSV export");
  }
};
