"use strict";

const mongoose = require("mongoose");
const Complaint = require("../../models/Complaint");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const { Parser } = require("json2csv");

// =======================================================
// AMI MAINTENANCE — PROFESSIONAL REPORT EXPORTS
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
    workbook.creator = "AMI MAINTENANCE";
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
    title.value = "AMI MAINTENANCE | MAINTENANCE OPERATIONS REPORT";
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
   AMI MAINTENANCE — PROFESSIONAL PDF EXPORT
   Manual Pagination | Compact Report | No Empty Pages
   ========================================================== */

exports.exportPDFReport = async (req, res) => {
  try {
    const data = await loadData(req);
    const stats = analytics(data.complaints);

    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      autoFirstPage: false,
      bufferPages: true,
      compress: true,
      margin: 0,
    });

    const PAGE_W = 841.89;
    const PAGE_H = 595.28;

    const LEFT = 34;
    const RIGHT = 34;
    const TOP = 76;
    const BOTTOM = 54;

    const CONTENT_W = PAGE_W - LEFT - RIGHT;
    const CONTENT_BOTTOM = PAGE_H - BOTTOM;

    const NAVY = "#102B52";
    const GOLD = "#D6AD59";
    const LIGHT = "#F3F6FA";
    const INK = "#18314F";
    const MUTED = "#64748B";

    let y = TOP;

    const clean = (value) =>
      String(value ?? "")
        .replace(/[\r\n\t]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    // Fixed-position text prevents automatic flow-based
    // pagination. Long values are truncated inside cells.
    const drawText = (value, x, top, width, height, options = {}) => {
      doc
        .font(options.bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(options.size || 8)
        .fillColor(options.color || INK)
        .text(clean(value), x, top, {
          width,
          height,
          lineBreak: false,
          ellipsis: true,
          align: options.align || "left",
        });
    };

    // ======================================================
    // CREATE PAGE
    // ======================================================

    const addPage = (title = "Maintenance Operations Report") => {
      doc.addPage({
        size: "A4",
        layout: "landscape",
        margin: 0,
      });

      doc.rect(0, 0, PAGE_W, 63).fill(NAVY);
      doc.rect(0, 63, PAGE_W, 3).fill(GOLD);

      drawText("AMI MAINTENANCE", LEFT, 11, 350, 17, {
        bold: true,
        size: 11,
        color: GOLD,
      });

      drawText(title, LEFT, 30, CONTENT_W, 25, {
        bold: true,
        size: 18,
        color: "#FFFFFF",
      });

      y = TOP;
    };

    // ======================================================
    // SECTION HEADING
    // ======================================================

    const section = (title, requiredSpace = 36) => {
      if (y + requiredSpace > CONTENT_BOTTOM) {
        addPage("Maintenance Report — Continued");
      }

      drawText(title, LEFT, y, CONTENT_W, 22, {
        bold: true,
        size: 12,
        color: NAVY,
      });

      y += 25;
    };

    // ======================================================
    // SUMMARY KPI
    // ======================================================

    const drawSummary = () => {
      section("Executive Summary", 120);

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

      const GAP = 7;

      const WIDTH = (CONTENT_W - GAP * (metrics.length - 1)) / metrics.length;

      metrics.forEach(([label, value], index) => {
        const x = LEFT + index * (WIDTH + GAP);

        doc.roundedRect(x, y, WIDTH, 61, 5).fill(LIGHT);

        drawText(value, x + 5, y + 10, WIDTH - 10, 24, {
          size: 17,
          bold: true,
          align: "center",
        });

        drawText(label, x + 3, y + 40, WIDTH - 6, 12, {
          size: 7,
          bold: true,
          align: "center",
          color: MUTED,
        });
      });

      y += 76;

      drawText(
        `Resolution Rate: ${stats.resolutionRate}%  |  ` +
          `Total Reopen Events: ${stats.totalReopenEvents}`,
        LEFT,
        y,
        CONTENT_W,
        16,
        {
          size: 9,
          color: MUTED,
        },
      );

      y += 25;
    };

    // ======================================================
    // TABLE COLUMN CONFIGURATION
    // ======================================================

    const columns = [
      { title: "COMPLAINT ID", width: 86 },
      { title: "DATE", width: 90 },
      { title: "LOCATION", width: 76 },
      { title: "ROOM", width: 55 },
      { title: "CATEGORY", width: 85 },
      { title: "ISSUE", width: 138 },
      { title: "TECHNICIAN", width: 105 },
      { title: "STATUS", width: 100 },
    ];

    const TABLE_W = columns.reduce((sum, column) => sum + column.width, 0);

    const HEADER_H = 27;
    const ROW_H = 32;

    // ======================================================
    // TABLE HEADER
    // ======================================================

    const drawTableHeader = () => {
      doc.rect(LEFT, y, TABLE_W, HEADER_H).fill(NAVY);

      let x = LEFT;

      columns.forEach((column) => {
        drawText(column.title, x + 5, y + 8, column.width - 10, 14, {
          bold: true,
          size: 7.5,
          color: "#FFFFFF",
        });

        x += column.width;
      });

      y += HEADER_H;
    };

    // ======================================================
    // TABLE ROW
    // ======================================================

    const drawRow = (values, index) => {
      if (y + ROW_H > CONTENT_BOTTOM) {
        addPage("Detailed Complaint Register — Continued");
        drawTableHeader();
      }

      if (index % 2 === 0) {
        doc.rect(LEFT, y, TABLE_W, ROW_H).fill(LIGHT);
      }

      let x = LEFT;

      columns.forEach((column, columnIndex) => {
        drawText(
          values[columnIndex] || "—",
          x + 5,
          y + 9,
          column.width - 10,
          15,
          {
            size: 8,
          },
        );

        x += column.width;
      });

      doc
        .moveTo(LEFT, y + ROW_H)
        .lineTo(LEFT + TABLE_W, y + ROW_H)
        .strokeColor("#E4EAF2")
        .lineWidth(0.4)
        .stroke();

      y += ROW_H;
    };

    // ======================================================
    // START REPORT
    // ======================================================

    addPage();

    drawText(`Generated: ${dateText(new Date())}`, LEFT, y, CONTENT_W, 16, {
      size: 9,
      color: MUTED,
    });

    y += 20;

    drawText(
      `Period: ${data.period.from || "All"} to ${
        data.period.to || "All"
      }  |  Location: ${data.filters.location}  |  ` +
        `Category: ${data.filters.category}`,
      LEFT,
      y,
      CONTENT_W,
      16,
      {
        size: 9,
        color: MUTED,
      },
    );

    y += 27;

    drawSummary();

    section("Detailed Complaint Register", 70);
    drawTableHeader();

    data.complaints.forEach((complaint, index) => {
      drawRow(
        [
          complaint.complaintId,
          dateText(complaint.createdAt),
          locationOf(complaint),
          complaint.roomNumber || "",
          complaint.category,
          complaint.title,
          name(complaint.assignedTo) || "Not Assigned",
          clean(complaint.status).replace(/_/g, " "),
        ],
        index,
      );
    });

    if (!data.complaints.length) {
      drawText("No matching complaints found.", LEFT, y + 12, CONTENT_W, 18, {
        color: MUTED,
        size: 10,
      });

      y += 35;
    }

    // ======================================================
    // LOCATION & CATEGORY BREAKDOWN
    // ======================================================

    const locations = stats.locationData || [];
    const categories = stats.categoryData || [];

    if (locations.length || categories.length) {
      // Continue on the current page when space permits.
      // Otherwise create exactly one new page.
      section("Operational Breakdown", 80);

      const renderBreakdown = (label, records) => {
        const content = records
          .map((item) => `${item._id}: ${item.total}`)
          .join("   |   ");

        const line = `${label}: ${content || "None"}`;

        // Wrap into manageable lines without overflowing.
        const chunks = doc.font("Helvetica").fontSize(9).heightOfString(line, {
          width: CONTENT_W,
        });

        const height = Math.min(Math.ceil(chunks) + 5, 110);

        if (y + height > CONTENT_BOTTOM) {
          addPage("Operational Breakdown — Continued");
        }

        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor(INK)
          .text(line, LEFT, y, {
            width: CONTENT_W,
            height: Math.min(height, CONTENT_BOTTOM - y),
            ellipsis: true,
          });

        y += height + 12;
      };

      renderBreakdown("Locations", locations);
      renderBreakdown("Categories", categories);
    }

    // ======================================================
    // FOOTERS — SAFE ABSOLUTE POSITIONS
    // ======================================================

    const pages = doc.bufferedPageRange();
    const totalPages = pages.count;

    for (let index = 0; index < totalPages; index++) {
      doc.switchToPage(pages.start + index);

      const footerY = PAGE_H - 31;

      doc
        .moveTo(LEFT, footerY)
        .lineTo(PAGE_W - RIGHT, footerY)
        .strokeColor("#E2E8F0")
        .lineWidth(0.5)
        .stroke();

      drawText(
        "AMI MAINTENANCE | Maintenance Operations Report",
        LEFT,
        footerY + 7,
        460,
        12,
        {
          size: 7.5,
          color: MUTED,
        },
      );

      drawText(
        `Page ${index + 1} of ${totalPages}`,
        PAGE_W - RIGHT - 105,
        footerY + 7,
        105,
        12,
        {
          size: 7.5,
          color: MUTED,
          align: "right",
        },
      );
    }

    // ======================================================
    // RESPONSE
    // ======================================================

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="AMI_MAINTENANCE_REPORT_${dateKey()}.pdf"`,
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
