"use strict";

require("dotenv").config();

const mongoose = require("mongoose");
const Inventory = require("../models/Inventory");

const APPLY = process.argv.includes("--apply");

async function main() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error("MONGO_URI is missing in .env");
  }

  await mongoose.connect(uri);

  console.log(
    APPLY
      ? "APPLY MODE: assigning missing item codes"
      : "DRY RUN: no database changes",
  );

  const items = await Inventory.find({})
    .select("_id itemCode itemName currentStock")
    .sort({ _id: 1 })
    .lean();

  const existingCodes = new Set(
    items
      .map((item) =>
        String(item.itemCode || "")
          .trim()
          .toUpperCase(),
      )
      .filter(Boolean),
  );

  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    const existingCode = String(item.itemCode || "").trim();

    if (existingCode) {
      skipped++;
      continue;
    }

    // Deterministic legacy code.
    // Does not attempt to replace a university's
    // official material-code mapping.
    const generatedCode = `AMI-LEG-${String(item._id).toUpperCase()}`;

    if (existingCodes.has(generatedCode)) {
      throw new Error(`Code collision detected: ${generatedCode}`);
    }

    console.log({
      item: item.itemName,
      newCode: generatedCode,
      stockUnchanged: item.currentStock,
    });

    if (APPLY) {
      const result = await Inventory.updateOne(
        {
          _id: item._id,
          $or: [
            { itemCode: { $exists: false } },
            { itemCode: null },
            { itemCode: "" },
          ],
        },
        {
          $set: { itemCode: generatedCode },
        },
        {
          runValidators: true,
        },
      );

      if (result.modifiedCount === 1) {
        updated++;
      } else {
        skipped++;
      }
    } else {
      updated++;
    }

    existingCodes.add(generatedCode);
  }

  console.log({
    mode: APPLY ? "APPLIED" : "DRY_RUN",
    candidatesOrUpdated: updated,
    skipped,
    total: items.length,
  });
}

main()
  .catch((error) => {
    console.error("BACKFILL ERROR:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
