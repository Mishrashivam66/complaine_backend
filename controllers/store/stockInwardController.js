"use strict";

const mongoose = require("mongoose");
const crypto = require("crypto");
const XLSX = require("xlsx");

const Inventory = require("../../models/Inventory");
const StockInward = require("../../models/StockInward");
const StockTransaction = require("../../models/StockTransaction");

// Excel import does not assign a category.
// The Store Manager assigns categories later.
const UNASSIGNED_CATEGORY = "Uncategorized";
const MAX_ROWS = 1000;

// ==========================================
// HELPERS
// ==========================================

const clean = (value) => String(value ?? "").trim();

const normalize = (value) =>
  clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const round = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;

function bad(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

// Manual inward needs a positive quantity.
// Excel can register zero-stock material masters.
function parseQuantity(value, allowZero = false) {
  if (value === null || value === undefined || clean(value) === "") {
    return allowZero ? 0 : NaN;
  }

  const text = clean(value).replace(/,/g, "");
  const amount = Number(text);

  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    (!allowZero && amount === 0) ||
    Math.abs(amount * 1000 - Math.round(amount * 1000)) > 1e-7
  ) {
    return NaN;
  }

  return round(amount);
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

function getMetadata(body = {}) {
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

// ==========================================
// VALIDATE ROWS
// ==========================================

function validateRows(
  rows,
  { allowZero = false, requireCategory = false } = {},
) {
  if (!Array.isArray(rows) || rows.length === 0) {
    bad("At least one inventory item is required");
  }

  if (rows.length > MAX_ROWS) {
    bad(`Maximum ${MAX_ROWS} items allowed per import`);
  }

  const codes = new Set();

  return rows.map((row, index) => {
    const itemCode = clean(row.itemCode).toUpperCase();

    const itemName = clean(row.itemName);
    const unit = clean(row.unit);
    const category = clean(row.category);

    const quantity = parseQuantity(row.quantity, allowZero);

    if (!itemCode || !itemName || !unit || !Number.isFinite(quantity)) {
      bad(
        `Row ${index + 1}: Item Code, Description, UOM and ${
          allowZero ? "non-negative" : "positive"
        } Quantity are required`,
      );
    }

    if (requireCategory && !category) {
      bad(`Row ${index + 1}: Category is required for manual inward`);
    }

    if (codes.has(itemCode)) {
      bad(`Duplicate Item Code in upload: ${itemCode}`);
    }

    codes.add(itemCode);

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
// READ UNIVERSITY EXCEL
// ==========================================
// Required headers:
// Item Code
// Item Description
// UOM
// Selected quantity column
//
// Optional header:
// Category Name
//
// New Excel items remain Uncategorized,
// even when Excel includes a category.
// ==========================================

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

    bad("Unable to read the Excel file. Upload a valid .xlsx workbook.");
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

  // Find Excel header row within first 20 rows.
  for (let index = 0; index < Math.min(data.length, 20); index++) {
    const headings = {};

    (data[index] || []).forEach((cell, columnIndex) => {
      const name = normalize(cell);

      if (name) {
        headings[name] = columnIndex;
      }
    });

    const selected = {};

    for (const [key, names] of Object.entries(aliases)) {
      const matched = names.find((alias) => headings[alias] !== undefined);

      selected[key] = matched === undefined ? undefined : headings[matched];
    }

    selected.quantity = headings[selectedQuantityColumn];

    // Category column is OPTIONAL.
    const validHeaders = ["itemCode", "itemName", "unit", "quantity"].every(
      (key) => selected[key] !== undefined,
    );

    if (validHeaders) {
      headerIndex = index;
      columns = selected;
      break;
    }
  }

  if (!columns) {
    bad(
      `Required Excel headers: Item Code, Item Description, UOM and "${quantityColumn}". Category Name is optional.`,
    );
  }

  const rows = [];

  for (let index = headerIndex + 1; index < data.length; index++) {
    const values = data[index] || [];

    const itemCode = clean(values[columns.itemCode]).toUpperCase();

    const itemName = clean(values[columns.itemName]);

    if (!itemCode && !itemName) {
      continue;
    }

    const unit = clean(values[columns.unit]);

    const category =
      columns.category === undefined ? "" : clean(values[columns.category]);

    const rawQuantity = clean(values[columns.quantity]);

    const quantity = parseQuantity(rawQuantity, true);

    if (!itemCode || !itemName || !unit) {
      bad(
        `Excel row ${index + 1}: Item Code, Description and UOM are required.`,
      );
    }

    if (!Number.isFinite(quantity)) {
      bad(
        `Excel row ${index + 1}: Quantity must be 0 or more, with up to 3 decimals.`,
      );
    }

    rows.push({
      itemCode,
      itemName,
      unit,
      category,
      quantity,
    });
  }

  return validateRows(rows, {
    allowZero: true,
  });
}

// ==========================================
// COMMON ATOMIC INWARD PROCESS
// ==========================================

async function processInward({
  rows,
  metadata,
  source,
  importKey,
  fileName = "",
  quantityColumn = "Quantity",
  userId,
}) {
  const excel = source === "EXCEL";

  const validRows = validateRows(rows, {
    allowZero: excel,
    requireCategory: !excel,
  });

  const session = await mongoose.startSession();

  try {
    let responseData;

    await session.withTransaction(async () => {
      // ==================================
      // DUPLICATE IMPORT PROTECTION
      // ==================================

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

      // ==================================
      // CREATE STOCK INWARD RECORD
      // ==================================

      const [inward] = await StockInward.create(
        [
          {
            inwardNo,
            importKey,
            source,

            ...metadata,

            fileName,
            quantityColumn,

            items: [],
            totalItems: 0,
            totalQuantity: 0,

            createdBy: userId,
          },
        ],
        {
          session,
        },
      );

      const completed = [];
      const receiptItems = [];

      // ==================================
      // PROCESS EACH IMPORTED MATERIAL
      // ==================================

      for (const row of validRows) {
        let inventory = await Inventory.findOne({
          itemCode: row.itemCode,
        }).session(session);

        let isNewItem = false;

        // ==================================
        // LEGACY MATCH BY ITEM NAME
        // ==================================

        if (!inventory) {
          const nameMatches = await Inventory.find({
            itemName: row.itemName,
          })
            .collation({
              locale: "en",
              strength: 2,
            })
            .session(session);

          if (nameMatches.length > 1) {
            bad(`Multiple old inventory matches for ${row.itemName}`, 409);
          }

          inventory = nameMatches[0] || null;

          if (
            inventory?.itemCode &&
            inventory.itemCode.toUpperCase() !== row.itemCode
          ) {
            bad(
              `Item ${row.itemName} already has different Item Code ${inventory.itemCode}`,
              409,
            );
          }
        }

        let before = 0;
        let after = 0;

        // ==================================
        // NEW INVENTORY MATERIAL
        // ==================================

        if (!inventory) {
          isNewItem = true;

          // Excel import creates an
          // unassigned master item.
          const initialCategory = excel
            ? UNASSIGNED_CATEGORY
            : row.category || UNASSIGNED_CATEGORY;

          const [created] = await Inventory.create(
            [
              {
                itemCode: row.itemCode,
                itemName: row.itemName,

                itemDescription: row.itemName,

                category: initialCategory,

                otherCategory: "",

                unit: row.unit,

                currentStock: row.quantity,

                openingQuantity: 0,

                incomingQuantity: row.quantity,

                outgoingQuantity: 0,

                minimumStock: 5,

                status: stockStatus(row.quantity, 5),
              },
            ],
            {
              session,
            },
          );

          inventory = created;
          after = row.quantity;
        } else {
          // ==================================
          // EXISTING INVENTORY MATERIAL
          // ==================================

          if (inventory.isActive === false) {
            bad(`Item ${row.itemCode} is inactive`, 409);
          }

          before = Number(inventory.currentStock || 0);

          after = before;

          // Add only positive quantities.
          // Never overwrite stock balances.
          if (row.quantity > 0) {
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

            inventory = await Inventory.findByIdAndUpdate(
              inventory._id,
              update,
              {
                new: true,
                session,
                runValidators: true,
              },
            );

            after = Number(inventory.currentStock || 0);
          } else if (!inventory.itemCode) {
            // Assign code to matching
            // legacy item without adding
            // stock.

            inventory = await Inventory.findByIdAndUpdate(
              inventory._id,
              {
                $set: {
                  itemCode: row.itemCode,
                },
              },
              {
                new: true,
                session,
                runValidators: true,
              },
            );
          }
        }

        // ==================================
        // PRESERVE EXISTING CATEGORY
        // ==================================

        const actualCategory = clean(inventory.category) || UNASSIGNED_CATEGORY;

        const displayCategory = /^(other|others)$/i.test(actualCategory)
          ? clean(inventory.otherCategory) || "Others"
          : actualCategory;

        // ==================================
        // UPDATE STOCK STATUS
        // ==================================

        if (row.quantity > 0) {
          await Inventory.updateOne(
            {
              _id: inventory._id,
            },
            {
              $set: {
                status: stockStatus(after, Number(inventory.minimumStock || 0)),
              },
            },
            {
              session,
            },
          );
        }

        const line = {
          inventoryItem: inventory._id,

          itemCode: row.itemCode,

          itemName: inventory.itemName || row.itemName,

          category: displayCategory,

          unit: inventory.unit || row.unit,

          quantity: row.quantity,

          isNewItem,

          stockBefore: before,
          stockAfter: after,
        };

        completed.push(line);

        // Zero quantity creates a
        // master record, NOT a
        // physical stock transaction.
        if (row.quantity === 0) {
          continue;
        }

        receiptItems.push(line);

        // ==================================
        // STOCK TRANSACTION
        // ==================================

        await StockTransaction.create(
          [
            {
              inventoryItem: inventory._id,

              itemCode: row.itemCode,

              itemName: inventory.itemName || row.itemName,

              unit: inventory.unit || row.unit,

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
          {
            session,
          },
        );
      }

      // ==================================
      // SAVE INWARD SUMMARY
      // ==================================

      inward.items = receiptItems;

      inward.totalItems = receiptItems.length;

      inward.totalQuantity = round(
        receiptItems.reduce((sum, item) => sum + item.quantity, 0),
      );

      await inward.save({
        session,
      });

      responseData = {
        inwardNo,
        inwardId: inward._id,

        totalRows: completed.length,

        newItems: completed.filter((item) => item.isNewItem).length,

        updatedItems: completed.filter(
          (item) => !item.isNewItem && item.quantity > 0,
        ).length,

        zeroStockMasters: completed.filter(
          (item) => item.isNewItem && item.quantity === 0,
        ).length,

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

    const rows = validateRows(req.body.items, {
      allowZero: false,
      requireCategory: true,
    });

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

    // Duplicate-file safety.
    // Same exact Excel cannot
    // be imported twice.
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

      message: "Excel inventory and stock imported successfully",

      ...result,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

// ==========================================
// GET /history
// ==========================================

exports.getInwardHistory = async (_req, res) => {
  try {
    const inward = await StockInward.find()
      .populate("createdBy", "name role")
      .sort({
        createdAt: -1,
      })
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
      .sort({
        transactionDate: -1,
        createdAt: -1,
      })
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
