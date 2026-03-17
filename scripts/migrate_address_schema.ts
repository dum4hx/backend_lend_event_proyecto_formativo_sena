/**
 * Migration: Refactor address schema to Colombian format
 *
 * Transforms existing address documents in three collections —
 * organizations, customers, and locations — from the old flat shape:
 *
 *   { country, state, city, street, postalCode?, additionalInfo?, propertyNumber? }
 *
 * to the new Colombian address shape:
 *
 *   { streetType, primaryNumber, secondaryNumber, complementaryNumber,
 *     department, city, additionalDetails?, postalCode?, country }
 *
 * Field mapping for migrated records:
 *   state           → department           (rename)
 *   additionalInfo  → additionalDetails    (rename)
 *   street          → primaryNumber        (old street value preserved)
 *   propertyNumber  → complementaryNumber  (location only)
 *   streetType      = "Calle"              (safe default — must be reviewed)
 *   secondaryNumber = "0"                  (unknown — must be reviewed)
 *   country         = "Colombia"           (default)
 *
 * Records whose address already has `streetType` are skipped (idempotent).
 *
 * Usage:
 *   Dry-run (preview without writing):
 *     $env:DRY_RUN='1'; npx tsx scripts/migrate_address_schema.ts
 *
 *   Apply changes:
 *     npx tsx scripts/migrate_address_schema.ts
 */

import mongoose from "mongoose";
import * as dotenv from "dotenv";

dotenv.config();

const DRY_RUN = process.env.DRY_RUN === "1";
const MONGO_URI = process.env.MONGODB_URI ?? process.env.MONGO_URI ?? "";

if (!MONGO_URI) {
  console.error(
    "ERROR: MONGODB_URI (or MONGO_URI) environment variable is not set.",
  );
  process.exit(1);
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function migrateAddress(old: Record<string, unknown>): Record<string, unknown> {
  // Already in new shape
  if (old.streetType) return old;

  return {
    streetType: "Calle", // safe default — review migrated records afterwards
    primaryNumber: old.street ?? "0",
    secondaryNumber: "0", // unknown from old data
    complementaryNumber: old.propertyNumber ?? "0",
    department: old.state ?? old.department ?? "",
    city: old.city ?? "",
    ...(old.additionalInfo || old.additionalDetails
      ? { additionalDetails: old.additionalInfo ?? old.additionalDetails }
      : {}),
    ...(old.postalCode ? { postalCode: old.postalCode } : {}),
    country: "Colombia",
    _migrationPending: true, // flag for manual review
  };
}

async function migrateCollection(
  db: mongoose.mongo.Db,
  collectionName: string,
  addressField: string,
): Promise<void> {
  const collection = db.collection(collectionName);

  // Only select documents that still use the OLD shape (no streetType field)
  const filter = {
    [addressField]: { $exists: true },
    [`${addressField}.streetType`]: { $exists: false },
  };

  const cursor = collection.find(filter, {
    projection: { _id: 1, [addressField]: 1 },
  });

  let updated = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    const oldAddr = doc[addressField] as Record<string, unknown> | undefined;

    if (!oldAddr) {
      skipped++;
      continue;
    }

    const newAddr = migrateAddress(oldAddr);

    if (DRY_RUN) {
      console.log(`  [DRY-RUN] ${collectionName}/${doc._id}:`);
      console.log("    before:", JSON.stringify(oldAddr));
      console.log("    after: ", JSON.stringify(newAddr));
    } else {
      await collection.updateOne(
        { _id: doc._id },
        { $set: { [addressField]: newAddr } },
      );
    }

    updated++;
  }

  console.log(
    `  ${collectionName}: ${updated} document(s) ${DRY_RUN ? "would be" : "were"} updated, ${skipped} skipped.`,
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(
    `\nAddress schema migration — ${DRY_RUN ? "DRY-RUN (no writes)" : "LIVE RUN"}\n`,
  );

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB.\n");

  const db = mongoose.connection.db!;

  await migrateCollection(db, "organizations", "address");
  await migrateCollection(db, "customers", "address");
  await migrateCollection(db, "locations", "address");

  await mongoose.disconnect();

  console.log("\nMigration complete.");
  if (!DRY_RUN) {
    console.log(
      "IMPORTANT: Records with `address._migrationPending: true` require manual review",
      "to fill in the correct streetType and secondaryNumber values.",
    );
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
