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

exports.exportPDFReport = async (req, res) => {
  try {
    const data = await loadData(req);
    const stats = analytics(data.complaints);

    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margins: {
        top: 40,
        bottom: 42,
        left: 34,
        right: 34,
      },
      bufferPages: true,
      autoFirstPage: false,
    });

    const PAGE_WIDTH = 841.89;
    const PAGE_HEIGHT = 595.28;
    const LEFT = 34;
    const RIGHT = PAGE_WIDTH - 34;
    const CONTENT_WIDTH = RIGHT - LEFT;

    const columns = [
      { key: "id", label: "COMPLAINT ID", width: 86 },
      { key: "date", label: "DATE", width: 89 },
      { key: "location", label: "LOCATION", width: 76 },
      { key: "room", label: "ROOM", width: 54 },
      { key: "category", label: "CATEGORY", width: 82 },
      { key: "title", label: "ISSUE", width: 137 },
      { key: "technician", label: "TECHNICIAN", width: 96 },
      { key: "status", label: "STATUS", width: 105 },
    ];

    const tableWidth = columns.reduce((sum, col) => sum + col.width, 0);

    let y = 0;

    function pageHeader(title) {
      doc.addPage();

      doc.rect(0, 0, PAGE_WIDTH, 63).fill("#102B52");

      doc
        .fillColor("#F0CC83")
        .font("Helvetica-Bold")
        .fontSize(10)
        .text("AMI MAINTENANCE", LEFT, 12);

      doc.fillColor("#FFFFFF").fontSize(18).text(title, LEFT, 29);

      doc.rect(0, 63, PAGE_WIDTH, 3).fill("#D6AD59");

      doc.fillColor("#102B52");
      y = 81;
    }

    function sectionTitle(value) {
      if (y + 34 > PAGE_HEIGHT - 48) {
        pageHeader("Maintenance Report — Continued");
      }

      doc
        .fillColor("#102B52")
        .font("Helvetica-Bold")
        .fontSize(12)
        .text(value, LEFT, y);

      y += 22;
    }

    function tableHeader() {
      doc.rect(LEFT, y, tableWidth, 26).fill("#102B52");

      let x = LEFT;

      columns.forEach((col) => {
        doc
          .font("Helvetica-Bold")
          .fontSize(7.5)
          .fillColor("#FFFFFF")
          .text(col.label, x + 5, y + 8, {
            width: col.width - 10,
            height: 14,
            ellipsis: true,
          });

        x += col.width;
      });

      y += 26;
    }

    function tableRow(values, index) {
      doc.font("Helvetica").fontSize(8);

      const heights = columns.map((col, i) =>
        doc.heightOfString(str(values[i]), {
          width: col.width - 10,
          lineGap: 1,
        }),
      );

      const rowHeight = Math.max(29, Math.min(72, Math.max(...heights) + 12));

      if (y + rowHeight > PAGE_HEIGHT - 48) {
        pageHeader("Detailed Complaint Register — Continued");
        tableHeader();
      }

      if (index % 2 === 0) {
        doc.rect(LEFT, y, tableWidth, rowHeight).fill("#F2F5FA");
      }

      let x = LEFT;

      columns.forEach((col, i) => {
        doc
          .fillColor("#173353")
          .font("Helvetica")
          .fontSize(8)
          .text(str(values[i]) || "—", x + 5, y + 6, {
            width: col.width - 10,
            height: rowHeight - 10,
            ellipsis: true,
            lineGap: 1,
          });

        x += col.width;
      });

      doc
        .moveTo(LEFT, y + rowHeight)
        .lineTo(LEFT + tableWidth, y + rowHeight)
        .strokeColor("#E4EAF2")
        .lineWidth(0.4)
        .stroke();

      y += rowHeight;
    }

    // FIRST PAGE
    pageHeader("Maintenance Operations Report");

    doc
      .fillColor("#53667F")
      .font("Helvetica")
      .fontSize(9)
      .text(
        `Generated: ${dateText(new Date())}    |    ` +
          `Period: ${data.period.from || "All"} - ${data.period.to || "All"}    |    ` +
          `Location: ${data.filters.location}    |    ` +
          `Category: ${data.filters.category}`,
        LEFT,
        y,
        { width: CONTENT_WIDTH },
      );

    y += 28;
    sectionTitle("Executive Summary");

    const summary = [
      ["TOTAL", stats.totalComplaints],
      ["PENDING", stats.pendingComplaints],
      ["IN PROGRESS", stats.inProgressComplaints],
      ["WORK DONE", stats.completedWork],
      ["RESOLVED", stats.resolvedComplaints],
      ["REOPENED", stats.currentlyReopened],
      ["OVERDUE", stats.overdueIssues],
      ["MATERIAL", stats.materialRequired],
    ];

    const gap = 7;
    const boxWidth =
      (CONTENT_WIDTH - gap * (summary.length - 1)) / summary.length;

    summary.forEach(([label, value], index) => {
      const x = LEFT + index * (boxWidth + gap);

      doc.roundedRect(x, y, boxWidth, 63, 5).fill("#F1F5F9");

      doc
        .fillColor("#102B52")
        .font("Helvetica-Bold")
        .fontSize(17)
        .text(String(value), x + 6, y + 9, {
          width: boxWidth - 12,
          align: "center",
        });

      doc
        .fillColor("#52657D")
        .font("Helvetica-Bold")
        .fontSize(7)
        .text(label, x + 3, y + 41, {
          width: boxWidth - 6,
          align: "center",
        });
    });

    y += 84;

    doc
      .fillColor("#52657D")
      .font("Helvetica")
      .fontSize(9)
      .text(
        `Resolution Rate: ${stats.resolutionRate}%   |   ` +
          `Total Reopen Events: ${stats.totalReopenEvents}   |   ` +
          `Registered Complaints: ${data.complaints.length}`,
        LEFT,
        y,
      );

    y += 27;
    sectionTitle("Detailed Complaint Register");

    tableHeader();

    data.complaints.forEach((c, index) => {
      tableRow(
        [
          c.complaintId,
          dateText(c.createdAt),
          locationOf(c),
          c.roomNumber,
          c.category,
          c.title,
          name(c.assignedTo) || "Not Assigned",
          up(c.status).replaceAll("_", " "),
        ],
        index,
      );
    });

    if (!data.complaints.length) {
      doc
        .fillColor("#64748B")
        .fontSize(10)
        .text("No matching complaints.", LEFT, y + 12);
    }

    // COMPACT LOCATION/CATEGORY SUMMARY
    if (y + 95 > PAGE_HEIGHT - 48) {
      pageHeader("Operational Breakdown");
    } else {
      y += 20;
    }

    sectionTitle("Location & Category Breakdown");

    const locationText = stats.locationData
      .map((r) => `${r._id}: ${r.total}`)
      .join("    |    ");

    const categoryText = stats.categoryData
      .map((r) => `${r._id}: ${r.total}`)
      .join("    |    ");

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#374F6D")
      .text(`Locations: ${locationText || "None"}`, LEFT, y, {
        width: CONTENT_WIDTH,
      });

    y = doc.y + 10;

    if (y + 25 > PAGE_HEIGHT - 48) {
      pageHeader("Operational Breakdown — Continued");
    }

    doc.text(`Categories: ${categoryText || "None"}`, LEFT, y, {
      width: CONTENT_WIDTH,
    });

    // PAGE FOOTERS
    const pages = doc.bufferedPageRange();

    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);

      doc
        .moveTo(LEFT, PAGE_HEIGHT - 34)
        .lineTo(RIGHT, PAGE_HEIGHT - 34)
        .strokeColor("#DCE3EB")
        .stroke();

      doc
        .fillColor("#64748B")
        .font("Helvetica")
        .fontSize(8)
        .text(
          "AMI MAINTENANCE | Confidential Maintenance Operations",
          LEFT,
          PAGE_HEIGHT - 27,
          { width: 430 },
        );

      doc.text(
        `Page ${i + 1} of ${pages.count}`,
        RIGHT - 90,
        PAGE_HEIGHT - 27,
        { width: 90, align: "right" },
      );
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="AMI_MAINTENANCE_COMPLETE_${dateKey()}.pdf"`,
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
