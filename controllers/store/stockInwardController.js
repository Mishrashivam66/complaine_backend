const mongoose = require("mongoose");
const crypto = require("crypto");
const ExcelJS = require("exceljs");

const Inventory = require("../../models/Inventory");
const StockInward = require("../../models/StockInward");
const StockTransaction = require("../../models/StockTransaction");

// ==========================================
// HELPERS
// ==========================================

const clean = (value) => String(value ?? "").trim();

const normalize = (value) =>
  clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const qty = (value) => {
  if (value === "" || value === null || value === undefined) {
    return NaN;
  }

  const number = Number(value);

  return Number.isFinite(number) &&
    number > 0 &&
    Math.round(number * 1000) / 1000 === number
    ? number
    : NaN;
};

const round = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;

function bad(message, status = 400) {
  const error = new Error(message);
  error.statusCode = status;
  throw error;
}

function stockStatus(stock, minimum) {
  if (stock <= 0) return "Out Of Stock";
  if (stock <= minimum) return "Low Stock";
  return "Available";
}

function keyHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function makeInwardNo() {
  return (
    "AMI-GRN-" +
    Date.now() +
    "-" +
    crypto.randomBytes(4).toString("hex").toUpperCase()
  );
}

function dateValue(value) {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getMetadata(body) {
  const billNo = clean(body.billNo);
  const grnNo = clean(body.grnNo);
  const vendorName = clean(body.vendorName);
  const receiptDate = dateValue(body.receiptDate);

  if (!billNo || !grnNo || !vendorName || !receiptDate) {
    bad("Bill No, GRN No, Vendor Name and valid Receipt Date are required");
  }

  return {
    billNo,
    grnNo,
    vendorName,
    receiptDate,
    remarks: clean(body.remarks),
  };
}

function validateRows(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    bad("At least one inventory item is required");
  }

  if (rows.length > 1000) {
    bad("Maximum 1000 items allowed per import");
  }

  const seen = new Set();

  return rows.map((row, index) => {
    const itemCode = clean(row.itemCode).toUpperCase();
    const itemName = clean(row.itemName);
    const category = clean(row.category);
    const unit = clean(row.unit);
    const quantity = qty(row.quantity);

    if (
      !itemCode ||
      !itemName ||
      !category ||
      !unit ||
      !Number.isFinite(quantity)
    ) {
      bad(
        `Row ${index + 1}: Item Code, Description, Category, UOM and positive Quantity are required`,
      );
    }

    if (seen.has(itemCode)) {
      bad(`Duplicate Item Code in upload: ${itemCode}`);
    }

    seen.add(itemCode);

    return {
      itemCode,
      itemName,
      category,
      unit,
      quantity,
    };
  });
}

// ==========================================
// EXCEL PARSING
// ==========================================

function cellText(cell) {
  if (!cell) return "";

  const value = cell.value;

  if (value === null || value === undefined) return "";

  if (typeof value === "object" && value.result !== undefined) {
    return clean(value.result);
  }

  if (typeof value === "object" && value.text !== undefined) {
    return clean(value.text);
  }

  return clean(cell.text ?? value);
}

async function readExcel(buffer, quantityColumn) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];

  if (!worksheet) bad("Excel sheet not found");

  const aliases = {
    itemCode: ["itemcode", "itemid"],
    itemName: ["itemdescription", "itemname", "description"],
    unit: ["uom", "unit"],
    category: ["categoryname", "category"],
  };

  const requestedColumn = normalize(quantityColumn);

  const allowedQuantityColumns = [
    "quantity",
    "qty",
    "openingqty",
    "openingquantity",
    "incoming",
    "incomingqty",
    "closingqty",
    "closingquantity",
  ];

  if (!allowedQuantityColumns.includes(requestedColumn)) {
    bad("Invalid quantity column selection");
  }

  let headerRow = null;
  let columns = null;

  // University sheets may have blank/title rows
  // before the actual column headers.
  const maxHeaderRow = Math.min(worksheet.rowCount, 20);

  for (let r = 1; r <= maxHeaderRow; r++) {
    const header = worksheet.getRow(r);
    const names = {};

    header.eachCell({ includeEmpty: false }, (cell, col) => {
      names[normalize(cellText(cell))] = col;
    });

    const selected = {};

    for (const [key, possible] of Object.entries(aliases)) {
      selected[key] = possible.map((alias) => names[alias]).find(Boolean);
    }

    selected.quantity = names[requestedColumn];

    if (
      selected.itemCode &&
      selected.itemName &&
      selected.category &&
      selected.unit &&
      selected.quantity
    ) {
      headerRow = r;
      columns = selected;
      break;
    }
  }

  if (!headerRow) {
    bad(
      "Excel headers not found. Required: Item Code, Item Description, UOM, Category Name and selected Quantity column",
    );
  }

  const rows = [];

  for (let r = headerRow + 1; r <= worksheet.rowCount; r++) {
    const excelRow = worksheet.getRow(r);

    const itemCode = cellText(excelRow.getCell(columns.itemCode));

    const itemName = cellText(excelRow.getCell(columns.itemName));

    // Ignore fully empty rows.
    if (!itemCode && !itemName) continue;

    const rawQuantity = cellText(excelRow.getCell(columns.quantity));

    // Zero quantities mean no new stock for
    // this particular import.
    if (rawQuantity === "" || Number(rawQuantity) === 0) {
      continue;
    }

    rows.push({
      itemCode,
      itemName,
      category: cellText(excelRow.getCell(columns.category)),
      unit: cellText(excelRow.getCell(columns.unit)),
      quantity: rawQuantity,
    });
  }

  return validateRows(rows);
}

// ==========================================
// COMMON ATOMIC INWARD PROCESS
// ==========================================

async function processInward({
  rows,
  metadata,
  source,
  importKey,
  fileName,
  quantityColumn,
  userId,
}) {
  const validRows = validateRows(rows);

  const session = await mongoose.startSession();

  try {
    let responseData;

    await session.withTransaction(async () => {
      const duplicate = await StockInward.findOne({
        importKey,
      }).session(session);

      if (duplicate) {
        bad(
          `This stock inward was already imported: ${duplicate.inwardNo}`,
          409,
        );
      }

      const inwardNo = makeInwardNo();

      const [inward] = await StockInward.create(
        [
          {
            inwardNo,
            importKey,
            source,
            ...metadata,
            fileName: fileName || "",
            quantityColumn: quantityColumn || "Quantity",
            items: [],
            totalItems: 0,
            totalQuantity: 0,
            createdBy: userId,
          },
        ],
        { session },
      );

      const completed = [];

      for (const row of validRows) {
        let inventory = await Inventory.findOne({
          itemCode: row.itemCode,
        }).session(session);

        let isNewItem = false;

        // Older inventory records may not
        // have university Item Codes yet.
        if (!inventory) {
          const nameMatches = await Inventory.find({
            itemName: row.itemName,
          })
            .collation({ locale: "en", strength: 2 })
            .session(session);

          if (nameMatches.length > 1) {
            bad(`Multiple old inventory matches for ${row.itemName}`, 409);
          }

          inventory = nameMatches[0] || null;

          if (
            inventory &&
            inventory.itemCode &&
            inventory.itemCode !== row.itemCode
          ) {
            bad(
              `Item ${row.itemName} already has different Item Code ${inventory.itemCode}`,
              409,
            );
          }
        }

        let before = 0;
        let after = 0;

        if (!inventory) {
          isNewItem = true;

          const [created] = await Inventory.create(
            [
              {
                itemCode: row.itemCode,
                itemName: row.itemName,
                itemDescription: row.itemName,
                category: row.category,
                unit: row.unit,
                currentStock: row.quantity,
                openingQuantity: 0,
                incomingQuantity: row.quantity,
                outgoingQuantity: 0,
                minimumStock: 5,
              },
            ],
            { session },
          );

          inventory = created;
          after = row.quantity;
        } else {
          if (inventory.isActive === false) {
            bad(`Item ${row.itemCode} is inactive`, 409);
          }

          before = Number(inventory.currentStock || 0);

          const update = {
            $inc: {
              currentStock: row.quantity,
              incomingQuantity: row.quantity,
            },
          };

          if (!inventory.itemCode) {
            update.$set = {
              itemCode: row.itemCode,
            };
          }

          inventory = await Inventory.findByIdAndUpdate(inventory._id, update, {
            new: true,
            session,
            runValidators: true,
          });

          after = Number(inventory.currentStock);
        }

        await Inventory.updateOne(
          { _id: inventory._id },
          {
            $set: {
              status: stockStatus(after, Number(inventory.minimumStock)),
            },
          },
          { session },
        );

        completed.push({
          inventoryItem: inventory._id,
          itemCode: row.itemCode,
          itemName: row.itemName,
          category: row.category,
          unit: row.unit,
          quantity: row.quantity,
          isNewItem,
          stockBefore: before,
          stockAfter: after,
        });

        await StockTransaction.create(
          [
            {
              inventoryItem: inventory._id,
              itemCode: row.itemCode,
              itemName: row.itemName,
              unit: row.unit,
              type: "INWARD",
              quantity: row.quantity,
              balanceBefore: before,
              balanceAfter: after,
              inward: inward._id,
              referenceNo: metadata.grnNo,
              billNo: metadata.billNo,
              vendorName: metadata.vendorName,
              transactionDate: metadata.receiptDate,
              performedBy: userId,
              remarks: metadata.remarks,
            },
          ],
          { session },
        );
      }

      inward.items = completed;
      inward.totalItems = completed.length;
      inward.totalQuantity = round(
        completed.reduce((sum, item) => sum + item.quantity, 0),
      );

      await inward.save({ session });

      responseData = {
        inwardNo,
        inwardId: inward._id,
        totalRows: completed.length,
        newItems: completed.filter((item) => item.isNewItem).length,
        updatedItems: completed.filter((item) => !item.isNewItem).length,
        totalQuantity: inward.totalQuantity,
        items: completed,
      };
    });

    return responseData;
  } finally {
    await session.endSession();
  }
}

// ==========================================
// COMMON ERROR RESPONSE
// ==========================================

function sendError(res, error) {
  console.error("STOCK INWARD ERROR:", error);

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message:
        "Duplicate import, Item Code or inward reference detected. Stock addition was not committed.",
    });
  }

  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  if (
    /Transaction numbers are only allowed|replica set/i.test(
      error.message || "",
    )
  ) {
    return res.status(503).json({
      success: false,
      message:
        "Database transactions are not available. Inward was not completed.",
    });
  }

  return res.status(500).json({
    success: false,
    message: "Stock inward failed",
  });
}

// ==========================================
// POST /manual
// ==========================================

exports.createManualInward = async (req, res) => {
  try {
    const metadata = getMetadata(req.body);
    const rows = validateRows(req.body.items);

    const importKey = keyHash(
      JSON.stringify({
        source: "MANUAL",
        vendor: metadata.vendorName.toLowerCase(),
        bill: metadata.billNo.toLowerCase(),
        grn: metadata.grnNo.toLowerCase(),
        rows: rows.slice().sort((a, b) => a.itemCode.localeCompare(b.itemCode)),
      }),
    );

    const result = await processInward({
      rows,
      metadata,
      source: "MANUAL",
      importKey,
      userId: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: "Stock inward completed successfully",
      ...result,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

// ==========================================
// POST /excel-import
// ==========================================

exports.importExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Excel file is required",
      });
    }

    const metadata = getMetadata(req.body);

    const quantityColumn = clean(req.body.quantityColumn) || "Closing Qty";

    const rows = await readExcel(req.file.buffer, quantityColumn);

    // Same exact file cannot be imported again.
    // Bill metadata is preserved in the record,
    // but changing the bill number does not
    // bypass the duplicate-file check.
    const importKey = keyHash(req.file.buffer);

    const result = await processInward({
      rows,
      metadata,
      source: "EXCEL",
      importKey,
      fileName: req.file.originalname,
      quantityColumn,
      userId: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: "Excel stock imported successfully",
      ...result,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

// ==========================================
// GET /history
// ==========================================

exports.getInwardHistory = async (req, res) => {
  try {
    const inward = await StockInward.find()
      .populate("createdBy", "name role")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.json({
      success: true,
      count: inward.length,
      inward,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

// ==========================================
// GET /transactions
// ==========================================

exports.getTransactions = async (req, res) => {
  try {
    const filter = {};

    if (req.query.itemCode) {
      filter.itemCode = clean(req.query.itemCode).toUpperCase();
    }

    if (req.query.type) {
      const allowed = [
        "OPENING",
        "INWARD",
        "ISSUE",
        "RETURN",
        "ADJUSTMENT_IN",
        "ADJUSTMENT_OUT",
      ];

      if (!allowed.includes(req.query.type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid transaction type",
        });
      }

      filter.type = req.query.type;
    }

    const transactions = await StockTransaction.find(filter)
      .populate("performedBy", "name role")
      .sort({ transactionDate: -1, createdAt: -1 })
      .limit(500)
      .lean();

    return res.json({
      success: true,
      count: transactions.length,
      transactions,
    });
  } catch (error) {
    return sendError(res, error);
  }
};
