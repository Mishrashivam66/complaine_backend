const mongoose = require("mongoose");
const crypto = require("crypto");
const XLSX = require("xlsx");

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

/**
 * Read university inventory Excel (.xlsx).
 *
 * Supports title rows before the column headers.
 * The selected quantity column is ADDITIVE stock.
 */
async function readExcel(buffer, quantityColumn) {
  let workbook;

  try {
    workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
      cellFormula: false,
    });
  } catch (error) {
    console.error("EXCEL READ ERROR:", error);

    const parseError = new Error(
      "Unable to read the Excel file. Please upload a valid .xlsx workbook.",
      { cause: error },
    );

    parseError.statusCode = 400;
    throw parseError;
  }

  if (!workbook.SheetNames?.length) {
    bad("No worksheet was found in the Excel file.");
  }

  const worksheet = workbook.Sheets[workbook.SheetNames[0]];

  if (!worksheet) {
    bad("The first Excel worksheet is empty.");
  }

  const data = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false,
  });

  if (!data.length) {
    bad("The Excel worksheet contains no data.");
  }

  const aliases = {
    itemCode: ["itemcode", "itemid"],
    itemName: ["itemdescription", "itemname", "description"],
    unit: ["uom", "unit"],
    category: ["categoryname", "category"],
  };

  const selectedQuantityColumn = normalize(quantityColumn);

  const allowedColumns = [
    "quantity",
    "qty",
    "incoming",
    "incomingqty",
    "openingqty",
    "openingquantity",
    "closingqty",
    "closingquantity",
  ];

  if (!allowedColumns.includes(selectedQuantityColumn)) {
    bad("Invalid quantity column selection.");
  }

  let headerIndex = -1;
  let columns = null;

  // Find the header row within the first 20 rows.
  for (let rowIndex = 0; rowIndex < Math.min(data.length, 20); rowIndex++) {
    const row = data[rowIndex] || [];
    const headings = {};

    row.forEach((value, columnIndex) => {
      const name = normalize(value);

      if (name) {
        headings[name] = columnIndex;
      }
    });

    const selected = {};

    for (const [key, names] of Object.entries(aliases)) {
      const match = names.find((name) => headings[name] !== undefined);

      selected[key] = match === undefined ? undefined : headings[match];
    }

    selected.quantity = headings[selectedQuantityColumn];

    if (
      Object.values(selected).every((columnIndex) => columnIndex !== undefined)
    ) {
      headerIndex = rowIndex;
      columns = selected;
      break;
    }
  }

  if (headerIndex === -1) {
    bad(
      `Required Excel columns were not found. Check Item Code, Item Description, UOM, Category Name and "${quantityColumn}".`,
    );
  }

  const rows = [];

  for (let rowIndex = headerIndex + 1; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex] || [];

    const itemCode = clean(row[columns.itemCode]).toUpperCase();

    const itemName = clean(row[columns.itemName]);

    if (!itemCode && !itemName) {
      continue;
    }

    const category = clean(row[columns.category]);
    const unit = clean(row[columns.unit]);

    const rawQuantity = clean(row[columns.quantity]);

    // Zero or empty quantity does not add stock.
    if (rawQuantity === "" || Number(rawQuantity) === 0) {
      continue;
    }

    const parsedQuantity = Number(rawQuantity.replace(/,/g, ""));

    if (!itemCode || !itemName || !category || !unit) {
      bad(`Excel row ${rowIndex + 1}: Required item fields are missing.`);
    }

    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      bad(`Excel row ${rowIndex + 1}: Invalid stock quantity.`);
    }

    rows.push({
      itemCode,
      itemName,
      category,
      unit,
      quantity: parsedQuantity,
    });
  }

  // Reuse existing duplicate and quantity validation.
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

    const quantityColumn = clean(req.body.quantityColumn) || "Incoming";
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
