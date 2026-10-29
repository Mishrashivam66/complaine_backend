"use strict";

require("dotenv").config();

const mongoose = require("mongoose");

const APPLY = process.argv.includes("--apply");

async function main() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error("MONGO_URI is missing");
  }

  await mongoose.connect(uri);

  const db = mongoose.connection.db;
  const collection = db.collection("inventories");

  console.log("Database:", mongoose.connection.name);
  console.log(
    APPLY
      ? "APPLY MODE: Writing missing item codes"
      : "DRY RUN: No database changes",
  );

  const items = await collection
    .find(
      {},
      {
        projection: {
          _id: 1,
          itemName: 1,
          itemCode: 1,
          currentStock: 1,
        },
      },
    )
    .sort({ _id: 1 })
    .toArray();

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    const existingCode = String(item.itemCode ?? "").trim();

    if (existingCode) {
      skipped++;
      continue;
    }

    const newCode = `AMI-LEG-${String(item._id).toUpperCase()}`;

    const duplicate = await collection.findOne({
      itemCode: newCode,
      _id: { $ne: item._id },
    });

    if (duplicate) {
      failed++;
      console.error("Duplicate Item Code:", item.itemName, newCode);
      continue;
    }

    console.log({
      item: item.itemName,
      newCode,
      stockUnchanged: item.currentStock,
    });

    if (!APPLY) {
      updated++;
      continue;
    }

    const result = await collection.updateOne(
      {
        _id: item._id,
        $or: [
          { itemCode: { $exists: false } },
          { itemCode: null },
          { itemCode: "" },
        ],
      },
      {
        $set: {
          itemCode: newCode,
        },
      },
    );

    const after = await collection.findOne(
      { _id: item._id },
      {
        projection: {
          itemCode: 1,
          currentStock: 1,
        },
      },
    );

    if (
      result.modifiedCount !== 1 ||
      after?.itemCode !== newCode ||
      after?.currentStock !== item.currentStock
    ) {
      failed++;

      console.error("Verification failed:", item.itemName);

      continue;
    }

    updated++;
  }

  console.log("\nFINAL RESULT:", {
    database: mongoose.connection.name,
    mode: APPLY ? "APPLIED" : "DRY_RUN",
    candidatesOrUpdated: updated,
    skipped,
    failed,
    total: items.length,
  });

  if (failed > 0) {
    throw new Error(`${failed} inventory items could not be verified.`);
  }
}

main()
  .catch((error) => {
    console.error("BACKFILL ERROR:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
