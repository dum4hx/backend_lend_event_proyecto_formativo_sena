/**
 * Migration: normalize material-instance serial/barcode values and sync unique indexes.
 *
 * What it does:
 * 1) Trims `serialNumber` and `barcode` in all documents.
 * 2) Unsets blank `barcode` values so partial unique index can ignore them.
 * 3) Reports duplicate candidates by `organizationId + serialNumber` and
 *    `organizationId + barcode` before syncing indexes.
 * 4) Runs `MaterialInstance.syncIndexes()`.
 *
 * Usage:
 *   Dry-run:
 *     $env:DRY_RUN='1'; npx tsx --env-file=.env scripts/migrate_material_instance_serial_barcode_indexes.ts
 *
 *   Apply:
 *     npx tsx --env-file=.env scripts/migrate_material_instance_serial_barcode_indexes.ts
 */

import mongoose from "mongoose";
import { MaterialInstance } from "../src/modules/material/models/material_instance.model.ts";

const DRY_RUN = process.env.DRY_RUN === "1";
const MONGO_URI = process.env.MONGODB_URI ?? process.env.DB_CONNECTION_STRING ?? "";

if (!MONGO_URI) {
  console.error("ERROR: MONGODB_URI (or DB_CONNECTION_STRING) is not set.");
  process.exit(1);
}

async function findDuplicateGroups(field: "serialNumber" | "barcode") {
  const baseMatch: Record<string, unknown> = {};
  if (field === "barcode") {
    baseMatch[field] = { $type: "string", $gt: "" };
  } else {
    baseMatch[field] = { $type: "string", $gt: "" };
  }

  return MaterialInstance.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id: {
          organizationId: "$organizationId",
          value: `$${field}`,
        },
        count: { $sum: 1 },
        ids: { $push: "$_id" },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $project: { _id: 1, count: 1, ids: 1 } },
  ]);
}

async function normalizeDocuments() {
  const cursor = MaterialInstance.find({}, { serialNumber: 1, barcode: 1 }).cursor();

  let updated = 0;
  for await (const doc of cursor) {
    const currentSerial = typeof doc.serialNumber === "string" ? doc.serialNumber : "";
    const currentBarcode = typeof doc.barcode === "string" ? doc.barcode : undefined;

    const nextSerial = currentSerial.trim();
    const nextBarcodeRaw = currentBarcode?.trim();
    const nextBarcode = nextBarcodeRaw && nextBarcodeRaw.length > 0 ? nextBarcodeRaw : undefined;

    const changed = nextSerial !== currentSerial || nextBarcode !== currentBarcode;
    if (!changed) continue;

    if (DRY_RUN) {
      console.log(
        `[DRY-RUN] ${doc._id}: serial='${currentSerial}' -> '${nextSerial}', barcode='${currentBarcode ?? ""}' -> '${nextBarcode ?? ""}'`,
      );
      updated += 1;
      continue;
    }

    doc.serialNumber = nextSerial;
    if (nextBarcode) {
      doc.barcode = nextBarcode;
    } else {
      doc.set("barcode", undefined);
    }
    await doc.save();
    updated += 1;
  }

  console.log(`${updated} document(s) ${DRY_RUN ? "would be" : "were"} normalized.`);
}

async function main() {
  console.log(`\nMaterial Instance migration - ${DRY_RUN ? "DRY-RUN" : "LIVE RUN"}\n`);

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB.");

  await normalizeDocuments();

  const serialDuplicates = await findDuplicateGroups("serialNumber");
  const barcodeDuplicates = await findDuplicateGroups("barcode");

  if (serialDuplicates.length > 0 || barcodeDuplicates.length > 0) {
    console.error("\nDuplicate keys found. Resolve these before syncing unique indexes:");
    if (serialDuplicates.length > 0) {
      console.error("- serialNumber duplicates:", JSON.stringify(serialDuplicates, null, 2));
    }
    if (barcodeDuplicates.length > 0) {
      console.error("- barcode duplicates:", JSON.stringify(barcodeDuplicates, null, 2));
    }
    await mongoose.disconnect();
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("\n[DRY-RUN] Index sync skipped.");
  } else {
    await MaterialInstance.syncIndexes();
    console.log("\nIndexes synchronized for MaterialInstance.");
  }

  await mongoose.disconnect();
  console.log("Migration finished.");
}

main().catch(async (error) => {
  console.error("Migration failed:", error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors during failure path
  }
  process.exit(1);
});
