"use strict";

const mongoose = require("mongoose");
const Complaint = require("../../models/Complaint");
const JobCard = require("../../models/JobCard");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const { Parser } = require("json2csv");

// =======================================================
// AMI MAINTENANCE — PROFESSIONAL REPORT CONTROLLER
// =======================================================

const TIMEZONE = "Asia/Kolkata";
const IST_OFFSET_MS = 330 * 60 * 1000;
const MAX_EXPORT_RECORDS = 25000;

const CLOSED = ["RESOLVED", "CLOSED"];

const text = (v) => String(v ?? "").trim();
const upper = (v) => text(v).toUpperCase();
const id = (v) => text(v?._id || v);

const normalize = (v) => upper(v).replace(/[^A-Z0-9]/g, "");

const escapeRegex = (v) => text(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const safeCell = (v) => {
  const value = text(v);
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
};

function dateLabel(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function dateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const get = (type) => parts.find((p) => p.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function shiftDay(day, amount) {
  const d = new Date(`${day}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}

function validDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function beginningIST(day) {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - IST_OFFSET_MS);
}

// =======================================================
// DATE RANGE
// =======================================================

function resolvePeriod(query) {
  const period = upper(query.period || "ALL");
  const today = dateKey();

  let from = text(query.fromDate || query.from);
  let to = text(query.toDate || query.to);

  if (period !== "CUSTOM" && period !== "ALL") {
    if (period === "TODAY") {
      from = today;
      to = today;
    } else if (period === "YESTERDAY") {
      from = shiftDay(today, -1);
      to = from;
    } else if (period === "WEEK") {
      const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();

      from = shiftDay(today, -((weekday + 6) % 7));
      to = today;
    } else if (period === "MONTH") {
      from = `${today.slice(0, 7)}-01`;
      to = today;
    } else if (period === "YEAR") {
      from = `${today.slice(0, 4)}-01-01`;
      to = today;
    } else {
      throw new Error("Invalid reporting period");
    }
  }

  if (
    (from && !validDay(from)) ||
    (to && !validDay(to)) ||
    (from && to && from > to)
  ) {
    throw new Error("Invalid reporting date range");
  }

  return { period, from, to };
}

// =======================================================
// LOCATION NORMALIZATION
// =======================================================

function hostelCode(value) {
  const raw =
    value && typeof value === "object"
      ? value.hostelCode || value.hostelName || value.name || ""
      : value;

  return normalize(raw).replace(/^(BOYS|GIRLS|FACULTY|STAFF)?HOSTEL/, "");
}

function locationOf(complaint) {
  const area = upper(complaint.complaintArea);

  if (area === "HOSTEL") {
    const hostel = hostelCode(complaint.hostel);

    return hostel || "UNSPECIFIED HOSTEL";
  }

  if (area === "DEPARTMENT") {
    return upper(complaint.block) || "UNSPECIFIED DEPARTMENT BLOCK";
  }

  if (area === "CAMPUS") {
    // Existing schema stores an Other Location name
    // at the beginning of issueLocation.
    const issue = text(complaint.issueLocation);
    return issue
      ? issue.split(" - ")[0].trim().toUpperCase()
      : "UNSPECIFIED CAMPUS LOCATION";
  }

  // Legacy records
  if (text(complaint.hostel)) {
    return hostelCode(complaint.hostel);
  }

  if (text(complaint.block)) {
    return upper(complaint.block);
  }

  return "UNSPECIFIED LOCATION";
}

function nameOf(value) {
  return value && typeof value === "object" ? text(value.name) : "";
}

function complaintStatus(complaint) {
  return upper(complaint.status);
}

function isResolved(complaint) {
  return CLOSED.includes(complaintStatus(complaint));
}

function isOverdue(complaint, now) {
  const deadline = complaint.deadline
    ? new Date(complaint.deadline).getTime()
    : NaN;

  return Number.isFinite(deadline) && deadline < now && !isResolved(complaint);
}

function groupBy(records, getKey) {
  const map = new Map();

  for (const record of records) {
    const key = text(getKey(record)) || "UNKNOWN";
    map.set(key, (map.get(key) || 0) + 1);
  }

  return [...map]
    .map(([_id, total]) => ({
      _id,
      total,
    }))
    .sort((a, b) => b.total - a.total || a._id.localeCompare(b._id));
}

// =======================================================
// FILTERED DATABASE QUERY
// =======================================================

function buildQuery(req) {
  const query = {};
  const period = resolvePeriod(req.query);

  if (period.from || period.to) {
    query.createdAt = {};

    if (period.from) {
      query.createdAt.$gte = beginningIST(period.from);
    }

    if (period.to) {
      query.createdAt.$lt = beginningIST(shiftDay(period.to, 1));
    }
  }

  const category = text(req.query.category);
  const status = text(req.query.status);
  const priority = text(req.query.priority);
  const technician = text(req.query.technician);

  if (category && upper(category) !== "ALL") {
    query.category = new RegExp(`^${escapeRegex(category)}$`, "i");
  }

  if (status && upper(status) !== "ALL") {
    query.status = upper(status);
  }

  if (priority && upper(priority) !== "ALL") {
    query.priority = upper(priority);
  }

  if (technician && upper(technician) !== "ALL") {
    if (!mongoose.isValidObjectId(technician)) {
      throw new Error("Invalid Technician ID");
    }

    query.assignedTo = technician;
  }

  return { query, period };
}

// =======================================================
// FETCH COMPLETE MATCHING COMPLAINT DATA
// =======================================================

async function fetchReportData(req) {
  const { query, period } = buildQuery(req);

  const location = text(req.query.location || "ALL");
  const search = text(req.query.search).toLowerCase();

  const records = await Complaint.find(query)
    .populate("createdBy", "name email role department")
    .populate("assignedTo", "name employeeId department role")
    .populate("assignedBy", "name role")
    .sort({ createdAt: -1, _id: -1 })
    .limit(MAX_EXPORT_RECORDS + 1)
    .lean();

  if (records.length > MAX_EXPORT_RECORDS) {
    const err = new Error(
      `Report exceeds ${MAX_EXPORT_RECORDS} records. ` +
        "Select a shorter date range or location.",
    );
    err.status = 413;
    throw err;
  }

  const complaints = records.filter((c) => {
    const actualLocation = locationOf(c);

    const matchesLocation =
      upper(location) === "ALL" ||
      normalize(actualLocation) === normalize(location);

    const searchable = [
      c.complaintId,
      c.title,
      c.description,
      c.category,
      c.hostel,
      c.block,
      c.issueLocation,
      c.roomNumber,
      nameOf(c.createdBy),
      nameOf(c.assignedTo),
    ]
      .map((v) => text(v).toLowerCase())
      .join(" ");

    return matchesLocation && (!search || searchable.includes(search));
  });

  return {
    complaints,
    period,
    filters: {
      location: location || "ALL",
      category: text(req.query.category || "ALL"),
      status: text(req.query.status || "ALL"),
      priority: text(req.query.priority || "ALL"),
      technician: text(req.query.technician || "ALL"),
      search: text(req.query.search),
    },
  };
}

// =======================================================
// REPORT ANALYTICS
// =======================================================

function summarize(complaints) {
  const now = Date.now();

  const count = (fn) => complaints.filter(fn).length;

  const resolved = count(isResolved);

  const stats = {
    totalComplaints: complaints.length,
    pendingComplaints: count((c) => complaintStatus(c) === "PENDING"),
    assignedComplaints: count((c) => complaintStatus(c) === "ASSIGNED"),
    inProgressComplaints: count((c) => complaintStatus(c) === "IN_PROGRESS"),
    waitingMaterial: count((c) => complaintStatus(c) === "WAITING_MATERIAL"),
    completedWork: count((c) => complaintStatus(c) === "COMPLETED"),
    resolvedComplaints: resolved,
    activeComplaints: count((c) => !isResolved(c)),
    currentlyReopened: count((c) => complaintStatus(c) === "REOPENED"),
    reopenedCases: count((c) => Number(c.reopenCount || 0) > 0),
    totalReopenEvents: complaints.reduce(
      (sum, c) => sum + Number(c.reopenCount || 0),
      0,
    ),
    overdueIssues: count((c) => isOverdue(c, now)),
    materialRequired: count((c) => c.materialRequired === true),
    resolutionRate: complaints.length
      ? Number(((resolved / complaints.length) * 100).toFixed(2))
      : 0,
  };

  const locationData = groupBy(complaints, locationOf);

  const categoryData = groupBy(complaints, (c) => upper(c.category));

  const statusData = groupBy(complaints, complaintStatus);

  const priorityData = groupBy(complaints, (c) => upper(c.priority));

  const dailyData = groupBy(complaints, (c) => dateKey(c.createdAt)).sort(
    (a, b) => a._id.localeCompare(b._id),
  );

  const map = new Map();

  for (const c of complaints) {
    if (!c.assignedTo) continue;

    const workerId = id(c.assignedTo);

    if (!map.has(workerId)) {
      map.set(workerId, {
        workerId,
        name: nameOf(c.assignedTo),
        department: c.assignedTo.department || "",
        totalJobs: 0,
        completedJobs: 0,
        resolvedJobs: 0,
        activeJobs: 0,
        reopenedJobs: 0,
      });
    }

    const worker = map.get(workerId);

    worker.totalJobs += 1;

    if (complaintStatus(c) === "COMPLETED") {
      worker.completedJobs += 1;
    }

    if (isResolved(c)) {
      worker.resolvedJobs += 1;
    } else {
      worker.activeJobs += 1;
    }

    if (Number(c.reopenCount || 0) > 0) {
      worker.reopenedJobs += 1;
    }
  }

  const workerEfficiency = [...map.values()]
    .map((worker) => ({
      ...worker,
      efficiency: worker.totalJobs
        ? Number(((worker.resolvedJobs / worker.totalJobs) * 100).toFixed(2))
        : 0,
    }))
    .sort((a, b) => b.efficiency - a.efficiency);

  return {
    ...stats,
    buildingData: locationData,
    locationData,
    categoryData,
    statusData,
    priorityData,
    dailyData,
    workerEfficiency,
    topWorker: workerEfficiency[0] || null,
  };
}

// =======================================================
// REPORT DETAILS
// =======================================================

function complaintRows(complaints) {
  return complaints.map((c, index) => ({
    "S.No": index + 1,
    "Complaint ID": c.complaintId || "",
    "Registered At": dateLabel(c.createdAt),
    "Complaint Area": c.complaintArea || "",
    Location: locationOf(c),
    Hostel: c.hostel || "",
    Block: c.block || "",
    Floor: c.floor || "",
    Room: c.roomNumber || "",
    "Issue Location": c.issueLocation || "",
    Category: c.category || "",
    Subcategory: c.subCategory || "",
    Title: c.title || "",
    Description: c.description || "",
    Priority: c.priority || "",
    Status: c.status || "",
    "Student Name": nameOf(c.createdBy),
    "Technician Name": nameOf(c.assignedTo),
    "Assigned By": nameOf(c.assignedBy),
    "Started At": dateLabel(c.startedAt),
    "Work Done At": dateLabel(c.completedAt),
    "Resolved At": dateLabel(c.resolvedAt),
    "Closed At": dateLabel(c.closedAt),
    Deadline: dateLabel(c.deadline),
    "Material Required": c.materialRequired ? "YES" : "NO",
    "Material Decision": c.materialDecision || "",
    "Student Decision": c.studentVerification?.decision || "",
    "Student Reason": c.studentVerification?.reason || "",
    "Student Verified At": dateLabel(c.studentVerification?.verifiedAt),
    "Reopen Count": c.reopenCount || 0,
    "Reopen Reason": c.reopenReason || "",
    "Escalation Reason": c.escalationReason || "",
    "Escalated At": dateLabel(c.escalatedAt),
    "Technician Remarks": c.workerRemarks || "",
    Remarks: c.remarks || "",
  }));
}

function historyRows(complaints) {
  return complaints.flatMap((c) =>
    (c.statusHistory || []).map((h) => ({
      "Complaint ID": c.complaintId || "",
      Location: locationOf(c),
      Status: h.status || "",
      "Changed At": dateLabel(h.changedAt),
      "Changed By ID": id(h.changedBy),
    })),
  );
}

function verificationRows(complaints) {
  return complaints
    .filter((c) => c.studentVerification?.decision)
    .map((c) => ({
      "Complaint ID": c.complaintId,
      Location: locationOf(c),
      Student: nameOf(c.createdBy),
      Technician: nameOf(c.assignedTo),
      Decision: c.studentVerification.decision,
      Reason: c.studentVerification.reason || "",
      "Verified At": dateLabel(c.studentVerification.verifiedAt),
      "Reopen Count": c.reopenCount || 0,
    }));
}

function summaryRows(report, filters, period) {
  return [
    ["Report", "AMI MAINTENANCE"],
    ["Reporting Period", period.period],
    ["From Date", period.from || "All Time"],
    ["To Date", period.to || "All Time"],
    ["Location", filters.location],
    ["Category", filters.category],
    ["Status", filters.status],
    ["Priority", filters.priority],
    ["Technician", filters.technician],
    ["Total Complaints", report.totalComplaints],
    ["Pending", report.pendingComplaints],
    ["Assigned", report.assignedComplaints],
    ["In Progress", report.inProgressComplaints],
    ["Waiting Material", report.waitingMaterial],
    ["Work Done", report.completedWork],
    ["Resolved", report.resolvedComplaints],
    ["Active", report.activeComplaints],
    ["Currently Reopened", report.currentlyReopened],
    ["Complaints Ever Reopened", report.reopenedCases],
    ["Total Reopen Events", report.totalReopenEvents],
    ["Overdue", report.overdueIssues],
    ["Material Required", report.materialRequired],
    ["Resolution Rate", `${report.resolutionRate}%`],
  ];
}

// =======================================================
// RESPONSE ERROR
// =======================================================

function handleError(res, error, operation) {
  console.error(`${operation} REPORT ERROR:`, error);

  if (res.headersSent) {
    res.destroy(error);
    return;
  }

  const status = error.status || (/^Invalid/.test(error.message) ? 400 : 500);

  return res.status(status).json({
    success: false,
    message:
      status === 500
        ? `Failed to ${operation.toLowerCase()} report`
        : error.message,
  });
}

// =======================================================
// GET REPORT DASHBOARD
// =======================================================

exports.getReports = async (req, res) => {
  try {
    const data = await fetchReportData(req);
    const report = summarize(data.complaints);

    const today = dateKey();
    const month = today.slice(0, 7);

    const todayComplaints = data.complaints.filter(
      (c) => dateKey(c.createdAt) === today,
    ).length;

    const monthlyComplaints = data.complaints.filter((c) =>
      dateKey(c.createdAt).startsWith(month),
    ).length;

    return res.status(200).json({
      success: true,
      report: {
        ...report,
        todayComplaints,
        monthlyComplaints,
      },
      filters: data.filters,
      period: data.period,
      locations: report.locationData,
      categories: report.categoryData,
      count: data.complaints.length,
    });
  } catch (error) {
    return handleError(res, error, "Load");
  }
};

// =======================================================
// GENERATE EXCEL HELPERS
// =======================================================

function addWorksheet(workbook, name, columns, rows) {
  const ws = workbook.addWorksheet(name);

  ws.columns = columns.map((column) => ({
    header: column,
    key: column,
    width: Math.min(45, Math.max(17, column.length + 4)),
  }));

  ws.addRows(
    rows.map((record) => {
      if (Array.isArray(record)) {
        return Object.fromEntries(
          columns.map((col, i) => [
            col,
            typeof record[i] === "string" ? safeCell(record[i]) : record[i],
          ]),
        );
      }

      return Object.fromEntries(
        columns.map((col) => [
          col,
          typeof record[col] === "string"
            ? safeCell(record[col])
            : (record[col] ?? ""),
        ]),
      );
    }),
  );

  ws.views = [{ state: "frozen", ySplit: 1 }];

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  ws.getRow(1).height = 28;

  ws.getRow(1).eachCell((cell) => {
    cell.font = {
      name: "Calibri",
      bold: true,
      color: { argb: "FFFFFFFF" },
    };

    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF102B52" },
    };

    cell.alignment = {
      vertical: "middle",
      wrapText: true,
    };
  });

  ws.eachRow((row, index) => {
    if (index === 1) return;

    row.alignment = {
      vertical: "top",
      wrapText: true,
    };

    if (index % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF4F7FB" },
        };
      });
    }
  });

  return ws;
}

// =======================================================
// FETCH LINKED JOB CARDS
// =======================================================

async function jobCardRows(complaints) {
  if (!complaints.length) return [];

  const ids = complaints.map((c) => c._id);

  const cards = await JobCard.find({
    "complaints.complaint": { $in: ids },
  })
    .populate("assignedWorker", "name")
    .lean();

  const valid = new Map(complaints.map((c) => [id(c._id), c]));

  const rows = [];

  for (const job of cards) {
    for (const item of job.complaints || []) {
      const complaint = valid.get(id(item.complaint));

      if (!complaint) continue;

      rows.push({
        "Job Card ID": job.jobCardId || "",
        "Complaint ID": complaint.complaintId || "",
        Location: locationOf(complaint),
        Category: complaint.category || "",
        Technician: nameOf(job.assignedWorker),
        "Job Status": job.status || "",
        "Print Status": job.printStatus || "",
        "Job Created At": dateLabel(job.createdAt),
        "Job Completed At": dateLabel(job.completedAt),
      });
    }
  }

  return rows;
}

// =======================================================
// EXPORT EXCEL
// =======================================================

exports.exportExcelReport = async (req, res) => {
  try {
    const data = await fetchReportData(req);
    const report = summarize(data.complaints);

    const details = complaintRows(data.complaints);
    const history = historyRows(data.complaints);
    const verification = verificationRows(data.complaints);
    const jobCards = await jobCardRows(data.complaints);

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "AMI MAINTENANCE";
    workbook.title = "Maintenance Operations Report";
    workbook.created = new Date();

    const summary = summaryRows(report, data.filters, data.period);

    addWorksheet(workbook, "Summary", ["Metric", "Value"], summary);

    const addGroup = (sheet, column, rows) =>
      addWorksheet(
        workbook,
        sheet,
        [column, "Total"],
        rows.map((r) => ({
          [column]: r._id,
          Total: r.total,
        })),
      );

    addGroup("Locations", "Location", report.locationData);

    addGroup("Categories", "Category", report.categoryData);

    addGroup("Statuses", "Status", report.statusData);

    addGroup("Priorities", "Priority", report.priorityData);

    addGroup("Daily Trend", "Date", report.dailyData);

    const addObjects = (sheet, rows, defaultColumns) => {
      addWorksheet(
        workbook,
        sheet,
        rows.length ? Object.keys(rows[0]) : defaultColumns,
        rows,
      );
    };

    addObjects("Complaints", details, ["Complaint ID"]);

    addObjects("Technicians", report.workerEfficiency, [
      "workerId",
      "name",
      "totalJobs",
    ]);

    addObjects("Student Verification", verification, [
      "Complaint ID",
      "Decision",
      "Reason",
    ]);

    addObjects("Status History", history, [
      "Complaint ID",
      "Status",
      "Changed At",
    ]);

    addObjects("Job Cards", jobCards, [
      "Job Card ID",
      "Complaint ID",
      "Status",
    ]);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="AMI_MAINTENANCE_${dateKey()}.xlsx"`,
    );

    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    return handleError(res, error, "Excel export");
  }
};

// =======================================================
// PDF HELPERS
// =======================================================

function newPdfPage(doc, title) {
  doc.addPage({
    size: "A4",
    layout: "landscape",
    margin: 35,
  });

  doc.rect(0, 0, doc.page.width, 58).fill("#102B52");

  doc
    .fillColor("#F1CC83")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("AMI MAINTENANCE", 35, 15);

  doc.fillColor("#FFFFFF").fontSize(17).text(title, 35, 31);

  doc.fillColor("#102B52");
}

function pdfTable(doc, title, columns, rows) {
  newPdfPage(doc, title);

  const left = 35;
  const maxWidth = doc.page.width - 70;
  const columnWidth = maxWidth / columns.length;

  function header() {
    doc.rect(left, 83, maxWidth, 26).fill("#102B52");

    columns.forEach((column, i) => {
      doc
        .fillColor("#FFFFFF")
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(column, left + i * columnWidth + 4, 91, {
          width: columnWidth - 8,
          lineBreak: false,
        });
    });

    doc.fillColor("#102B52");
  }

  header();

  let y = 113;

  for (const row of rows) {
    const values = Array.isArray(row)
      ? row
      : columns.map((column) => row[column]);

    const strings = values.map((value) => text(value).replace(/[\r\n]+/g, " "));

    const height = Math.max(
      25,
      ...strings.map(
        (value) =>
          doc.heightOfString(value, {
            width: columnWidth - 8,
            fontSize: 7.5,
          }) + 10,
      ),
    );

    const rowHeight = Math.min(height, 76);

    if (y + rowHeight > doc.page.height - 35) {
      newPdfPage(doc, title + " (Continued)");
      header();
      y = 113;
    }

    doc
      .rect(left, y, maxWidth, rowHeight)
      .fill(Math.floor(y) % 2 === 0 ? "#F3F6FB" : "#FFFFFF");

    strings.forEach((value, index) => {
      doc
        .fillColor("#1F3655")
        .font("Helvetica")
        .fontSize(7.5)
        .text(value, left + index * columnWidth + 4, y + 6, {
          width: columnWidth - 8,
          height: rowHeight - 9,
          ellipsis: true,
        });
    });

    y += rowHeight;
  }

  if (!rows.length) {
    doc
      .fillColor("#63748B")
      .fontSize(10)
      .text("No matching records", left, 125);
  }
}

// =======================================================
// EXPORT PDF
// =======================================================

exports.exportPDFReport = async (req, res) => {
  try {
    const data = await fetchReportData(req);
    const report = summarize(data.complaints);

    const doc = new PDFDocument({
      autoFirstPage: false,
      bufferPages: true,
      margin: 35,
    });

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="AMI_MAINTENANCE_${dateKey()}.pdf"`,
    );

    doc.pipe(res);

    newPdfPage(doc, "Maintenance Operations Report");

    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#102B52")
      .text(`Generated: ${dateLabel(new Date())}`, 35, 90);

    doc.text(
      `Period: ${data.period.from || "All"} to ${data.period.to || "All"}`,
      35,
      112,
    );

    doc.text(`Location: ${data.filters.location}`, 35, 134);

    doc.text(`Category: ${data.filters.category}`, 35, 156);

    doc.text(`Total Complaints: ${report.totalComplaints}`, 35, 195);

    doc.text(`Resolved: ${report.resolvedComplaints}`, 35, 217);

    doc.text(`Work Done: ${report.completedWork}`, 35, 239);

    doc.text(`Reopened: ${report.currentlyReopened}`, 35, 261);

    doc.text(`Overdue: ${report.overdueIssues}`, 35, 283);

    doc
      .font("Helvetica-Bold")
      .text(`Resolution Rate: ${report.resolutionRate}%`, 35, 315);

    pdfTable(
      doc,
      "Location-wise Analysis",
      ["Location", "Total"],
      report.locationData.map((r) => [r._id, r.total]),
    );

    pdfTable(
      doc,
      "Category-wise Analysis",
      ["Category", "Total"],
      report.categoryData.map((r) => [r._id, r.total]),
    );

    pdfTable(
      doc,
      "Status Distribution",
      ["Status", "Total"],
      report.statusData.map((r) => [r._id, r.total]),
    );

    pdfTable(
      doc,
      "Daily Complaint Trend",
      ["Date", "Complaints"],
      report.dailyData.map((r) => [r._id, r.total]),
    );

    pdfTable(
      doc,
      "Detailed Complaint Register",
      [
        "Complaint ID",
        "Date",
        "Location",
        "Category",
        "Title",
        "Technician",
        "Status",
        "Priority",
      ],
      data.complaints.map((c) => [
        c.complaintId,
        dateLabel(c.createdAt),
        locationOf(c),
        c.category,
        c.title,
        nameOf(c.assignedTo),
        c.status,
        c.priority,
      ]),
    );

    pdfTable(
      doc,
      "Student Satisfaction & Reopen Report",
      [
        "Complaint ID",
        "Location",
        "Decision",
        "Reason",
        "Verified At",
        "Reopen Count",
      ],
      data.complaints
        .filter(
          (c) =>
            c.studentVerification?.decision || Number(c.reopenCount || 0) > 0,
        )
        .map((c) => [
          c.complaintId,
          locationOf(c),
          c.studentVerification?.decision || "",
          c.studentVerification?.reason || c.reopenReason || "",
          dateLabel(c.studentVerification?.verifiedAt),
          c.reopenCount || 0,
        ]),
    );

    const pages = doc.bufferedPageRange();

    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);

      doc
        .fillColor("#63748B")
        .font("Helvetica")
        .fontSize(8)
        .text(
          `AMI MAINTENANCE | Page ${i + 1} of ${pages.count}`,
          35,
          doc.page.height - 22,
          {
            align: "right",
            width: doc.page.width - 70,
          },
        );
    }

    doc.end();
  } catch (error) {
    return handleError(res, error, "PDF export");
  }
};

// =======================================================
// EXPORT CSV
// =======================================================

exports.exportCSVReport = async (req, res) => {
  try {
    const data = await fetchReportData(req);

    const rows = complaintRows(data.complaints);

    const fields = rows.length ? Object.keys(rows[0]) : ["Complaint ID"];

    const parser = new Parser({ fields });

    const csv = parser.parse(
      rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            typeof value === "string" ? safeCell(value) : value,
          ]),
        ),
      ),
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="AMI_MAINTENANCE_${dateKey()}.csv"`,
    );

    return res.send("\uFEFF" + csv);
  } catch (error) {
    return handleError(res, error, "CSV export");
  }
};
