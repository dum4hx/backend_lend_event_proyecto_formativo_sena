/**
 * Migration: Drop obsolete incident indexes.
 *
 * What it does:
 * 1) Drops all unique indexes in the incidents collection (except _id).
 * 2) Syncs indexes from the current Incident schema.
 *
 * Usage:
 *   Dry-run:
 *     $env:DRY_RUN='1'; npx tsx --env-file=.env scripts/drop_incident_indexes.ts
 *
 *   Apply:
 *     npx tsx --env-file=.env scripts/drop_incident_indexes.ts
 */

import mongoose from "mongoose";
import { Incident } from "../src/modules/incident/models/incident.model.ts";

const DRY_RUN = process.env.DRY_RUN === "1";
const MONGO_URI =
  process.env.MONGODB_URI ?? process.env.DB_CONNECTION_STRING ?? "";

if (!MONGO_URI) {
  console.error("ERROR: MONGODB_URI (or DB_CONNECTION_STRING) is not set.");
  process.exit(1);
}

async function main() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✓ Connected");

    const collection = Incident.collection;

    // List existing indexes
    console.log("\n📋 Existing indexes:");
    const indexes = await collection.getIndexes();
    Object.entries(indexes).forEach(([name, spec]) => {
      console.log(`  - ${name}: ${JSON.stringify(spec)}`);
    });

    // Drop all unique indexes except the default _id index
    const uniqueIndexNames = Object.entries(indexes)
      .filter(([name, spec]) => name !== "_id_" && !!(spec as any).unique)
      .map(([name]) => name);

    if (!uniqueIndexNames.length) {
      console.log("\nNo unique indexes found to drop.");
    } else if (DRY_RUN) {
      console.log("\n[DRY RUN] Would drop unique indexes:");
      uniqueIndexNames.forEach((name) => console.log(`  - ${name}`));
    } else {
      console.log("\nDropping unique indexes:");
      for (const indexName of uniqueIndexNames) {
        console.log(`  - Dropping ${indexName}`);
        await collection.dropIndex(indexName);
      }
      console.log("✓ Unique index cleanup completed");
    }

    // Sync indexes to ensure current schema indexes are applied
    if (!DRY_RUN) {
      console.log("\nSyncing current indexes from schema...");
      await Incident.syncIndexes();
      console.log("✓ Indexes synced");
    }

    // Verify final state
    console.log("\n📋 Final indexes:");
    const finalIndexes = await collection.getIndexes();
    Object.entries(finalIndexes).forEach(([name, spec]) => {
      console.log(`  - ${name}: ${JSON.stringify(spec)}`);
    });

    console.log("\n✅ Migration complete");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
