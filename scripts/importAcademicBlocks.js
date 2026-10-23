"use strict";

require("dotenv").config();

const mongoose = require("mongoose");
const Building = require("../models/Building");
const Block = require("../models/Block");

const apply = process.argv.includes("--apply");

async function run() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing");
    }

    await mongoose.connect(process.env.MONGO_URI);

    const buildings = await Building.find().lean();

    let reviewed = 0;

    for (const building of buildings) {
      const match =
        /^(?:academic\s*)?block\s*[-_: ]+\s*([A-Z0-9]{1,12})$/i.exec(
          String(building.buildingName || "").trim(),
        );

      if (!match) {
        console.log("SKIP (not clearly academic):", building.buildingName);

        continue;
      }

      const code = match[1].toUpperCase();

      const existing = await Block.findOne({
        code,
      });

      const incoming = {
        name: building.buildingName,
        buildingType: building.buildingType || "",
        startFloor: building.startFloor || "Ground",
        endFloor: building.endFloor || "Fourth",
        roomRange: building.roomRange || "",
        departments: [],
      };

      if (existing) {
        const missing = {};

        for (const key of ["buildingType", "roomRange"]) {
          if (!existing[key] && incoming[key]) {
            missing[key] = incoming[key];
          }
        }

        console.log(
          "EXISTS:",
          code,
          Object.keys(missing).length ? "Fill missing fields" : "No change",
        );

        if (apply && Object.keys(missing).length) {
          await Block.updateOne({ _id: existing._id }, { $set: missing });
        }
      } else {
        console.log("IMPORT:", code, incoming.name);

        if (apply) {
          await Block.create({
            code,
            ...incoming,
            isActive: true,
            isDeleted: false,
          });
        }
      }

      reviewed++;
    }

    console.log(
      `Reviewed ${reviewed} academic records. Mode: ${
        apply ? "APPLY" : "DRY RUN"
      }`,
    );
  } catch (error) {
    console.error("Import failed:", error.message);

    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
