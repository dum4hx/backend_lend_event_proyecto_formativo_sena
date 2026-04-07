/**
 * scripts/backfill_category_type_codes.ts
 *
 * Backfills the `code` field on existing Category and MaterialType documents
 * that were created before the code field was added.
 *
 * Strategy:
 *   Derives a short uppercase alphanumeric code from the document's `name`.
 *   Removes non-alphanumeric chars, takes first 3 characters, and if a
 *   collision exists within the same org, extends to 4, 5, … up to 10.
 *   If still colliding, appends a numeric suffix (e.g. ABC1, ABC2).
 *
 * Usage (dry-run — no writes):
 *   npx tsx --env-file=.env scripts/backfill_category_type_codes.ts
 *
 * Apply changes:
 *   npx tsx --env-file=.env scripts/backfill_category_type_codes.ts --apply
 *
 * Filter by organization:
 *   npx tsx --env-file=.env scripts/backfill_category_type_codes.ts --apply --org 6650...
 *
 * Filter by entity (category | material_type):
 *   npx tsx --env-file=.env scripts/backfill_category_type_codes.ts --apply --entity category
 */

import mongoose, { Types } from "mongoose";
import { connectDB } from "../src/utils/db/connectDB.ts";
import { Category } from "../src/modules/material/models/category.model.ts";
import { MaterialModel } from "../src/modules/material/models/material_type.model.ts";

/* ---------- CLI Flags ---------- */

const apply = process.argv.includes("--apply");

const orgFlag = process.argv.indexOf("--org");
const orgFilter =
  orgFlag !== -1 && process.argv[orgFlag + 1]
    ? process.argv[orgFlag + 1]
    : undefined;

const entityFlag = process.argv.indexOf("--entity");
const entityFilter =
  entityFlag !== -1 && process.argv[entityFlag + 1]
    ? (process.argv[entityFlag + 1] as "category" | "material_type")
    : undefined;

/* ---------- Code derivation ---------- */

const MIN_CODE_LEN = 3;
const MAX_CODE_LEN = 10;

/**
 * Derive a unique code from a name, given a set of already-used codes
 * within the same organization.
 */
function deriveUniqueCode(name: string, usedCodes: Set<string>): string {
  // Strip non-alphanumeric, uppercase
  const clean = name.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

  if (clean.length === 0) {
    // Fallback for names with no alphanumeric characters
    for (let i = 1; i <= 9999; i++) {
      const candidate = `X${String(i).padStart(3, "0")}`;
      if (!usedCodes.has(candidate)) return candidate;
    }
    throw new Error(`No se pudo generar un código para el nombre: "${name}"`);
  }

  // Try progressively longer prefixes: 3, 4, 5 … up to 10
  for (
    let len = MIN_CODE_LEN;
    len <= Math.min(clean.length, MAX_CODE_LEN);
    len++
  ) {
    const candidate = clean.substring(0, len);
    if (!usedCodes.has(candidate)) return candidate;
  }

  // If all prefix lengths collide, try base (up to 7 chars) + numeric suffix
  const base = clean.substring(0, Math.min(clean.length, 7));
  for (let suffix = 1; suffix <= 999; suffix++) {
    const candidate = `${base}${suffix}`.substring(0, MAX_CODE_LEN);
    if (!usedCodes.has(candidate)) return candidate;
  }

  throw new Error(
    `No se pudo generar un código único para el nombre: "${name}" en la organización`,
  );
}

/* ---------- Main ---------- */

async function run() {
  await connectDB();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Backfill Category/MaterialType Codes`);
  console.log(`  Mode: ${apply ? "APPLY" : "DRY RUN"}`);
  if (orgFilter) console.log(`  Organization filter: ${orgFilter}`);
  if (entityFilter) console.log(`  Entity filter: ${entityFilter}`);
  console.log(`${"=".repeat(60)}\n`);

  const entities: Array<{
    type: string;
    model: mongoose.Model<any>;
    label: string;
  }> = [];

  if (!entityFilter || entityFilter === "category") {
    entities.push({ type: "category", model: Category, label: "Category" });
  }
  if (!entityFilter || entityFilter === "material_type") {
    entities.push({
      type: "material_type",
      model: MaterialModel,
      label: "MaterialType",
    });
  }

  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const entity of entities) {
    console.log(`\n--- ${entity.label} ---\n`);

    // Query docs missing code
    const query: Record<string, unknown> = {
      $or: [{ code: { $exists: false } }, { code: null }, { code: "" }],
    };
    if (orgFilter) {
      query.organizationId = new Types.ObjectId(orgFilter);
    }

    const docs = await entity.model
      .find(query)
      .select({ _id: 1, organizationId: 1, name: 1 })
      .sort({ organizationId: 1, name: 1 })
      .lean();

    console.log(`  Found ${docs.length} ${entity.label}(s) missing code\n`);

    if (docs.length === 0) continue;

    // Group by org to track used codes per org
    const orgGroups = new Map<string, typeof docs>();
    for (const doc of docs) {
      const orgStr = String(doc.organizationId);
      if (!orgGroups.has(orgStr)) orgGroups.set(orgStr, []);
      orgGroups.get(orgStr)!.push(doc);
    }

    for (const [orgStr, orgDocs] of orgGroups) {
      // Load existing codes for this org
      const existingDocs = await entity.model
        .find(
          {
            organizationId: new Types.ObjectId(orgStr),
            code: { $exists: true, $nin: [null, ""] },
          },
          { code: 1 },
        )
        .lean();

      const usedCodes = new Set<string>(
        existingDocs.map((d: any) => String(d.code).toUpperCase()),
      );

      for (const doc of orgDocs) {
        try {
          const name = (doc as any).name ?? "";
          const code = deriveUniqueCode(name, usedCodes);
          usedCodes.add(code);

          if (apply) {
            await entity.model.updateOne({ _id: doc._id }, { $set: { code } });
            console.log(
              `  [OK] ${entity.label} ${doc._id} "${name}" → "${code}"`,
            );
            totalUpdated++;
          } else {
            console.log(
              `  [PREVIEW] ${entity.label} ${doc._id} "${name}" → "${code}"`,
            );
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  [ERROR] ${entity.label} ${doc._id} — ${msg}`);
          totalErrors++;
        }
      }
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(
    `  ${apply ? `Updated: ${totalUpdated}` : "Dry-run (no writes)"}`,
  );
  console.log(`  Errors: ${totalErrors}`);
  console.log(`${"=".repeat(60)}\n`);

  await mongoose.disconnect();

  if (totalErrors > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
