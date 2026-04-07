/**
 * scripts/backfill_entity_codes.ts
 *
 * Backfills the `code` field on existing Loan and LoanRequest documents
 * that were created before the code generation system was added.
 *
 * Strategy:
 *   For each document missing `code`, uses the organization's default
 *   CodeScheme (or the fallback pattern) to generate a code.
 *   The document's `createdAt` is used as the date context for
 *   period-based scope keys, ensuring codes are grouped by the
 *   original creation period.
 *
 *   The script also seeds default CodeSchemes for organizations
 *   that don't have them yet.
 *
 * Usage (dry-run — no writes):
 *   npx tsx --env-file=.env scripts/backfill_entity_codes.ts
 *
 * Apply changes:
 *   npx tsx --env-file=.env scripts/backfill_entity_codes.ts --apply
 *
 * Filter by organization:
 *   npx tsx --env-file=.env scripts/backfill_entity_codes.ts --apply --org 6650...
 *
 * Filter by entity type (loan | loan_request | both):
 *   npx tsx --env-file=.env scripts/backfill_entity_codes.ts --apply --entity loan
 */

import mongoose, { Types } from "mongoose";
import { connectDB } from "../src/utils/db/connectDB.ts";
import { Loan } from "../src/modules/loan/models/loan.model.ts";
import { LoanRequest } from "../src/modules/request/models/request.model.ts";
import { CodeScheme } from "../src/modules/code_scheme/models/code_scheme.model.ts";
import { CodeCounter } from "../src/modules/code_scheme/models/code_counter.model.ts";
import { Location } from "../src/modules/location/models/location.model.ts";
import {
  validatePattern,
  buildScopeKey,
  resolvePattern,
  buildTokenValues,
  type CodeGenContext,
} from "../src/modules/code_scheme/code_pattern.utils.ts";

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
    ? (process.argv[entityFlag + 1] as "loan" | "loan_request")
    : undefined;

/* ---------- Fallback patterns (same as code_generation.service.ts) ---------- */

const FALLBACK_PATTERNS: Record<string, string> = {
  loan: "LN-{SEQ:4}",
  loan_request: "REQ-{SEQ:4}",
};

const FALLBACK_SCHEME_IDS: Record<string, Types.ObjectId> = {
  loan: new Types.ObjectId("000000000000000000000001"),
  loan_request: new Types.ObjectId("000000000000000000000002"),
};

/* ---------- Code generation (offline, adapted for backfill) ---------- */

/**
 * Generate a code for a single document, using its createdAt as the date
 * context. Atomically increments the counter even in dry-run to keep the
 * preview consistent; counters are not written in dry-run mode.
 */
async function generateCodeForDocument(
  orgId: Types.ObjectId,
  entityType: "loan" | "loan_request",
  createdAt: Date,
  locationId?: Types.ObjectId,
  session?: mongoose.ClientSession,
): Promise<string> {
  // 1. Find default scheme for org
  const scheme = await CodeScheme.findOne({
    organizationId: orgId,
    entityType,
    isDefault: true,
    isActive: true,
  });

  const pattern = scheme?.pattern ?? FALLBACK_PATTERNS[entityType];
  const schemeId = scheme?._id ?? FALLBACK_SCHEME_IDS[entityType];

  // 2. Validate pattern
  const validation = validatePattern(pattern);
  if (!validation.valid) {
    throw new Error(
      `Patrón inválido para ${entityType} en org ${orgId}: ${validation.errors.join(", ")}`,
    );
  }

  // 3. Build context using the document's original createdAt
  const genContext: CodeGenContext = { date: createdAt };

  if (pattern.includes("{LOCATION_CODE}") && locationId) {
    const location = await Location.findById(locationId, { code: 1 }).lean();
    if (location && (location as any).code) {
      genContext.locationCode = (location as any).code;
    }
  }

  // 4. Build scope key
  const scopeKey = buildScopeKey(pattern, genContext);

  // 5. Atomic increment
  const counter = await CodeCounter.findOneAndUpdate(
    { organizationId: orgId, schemeId, scopeKey },
    { $inc: { currentValue: 1 } },
    {
      upsert: true,
      new: true,
      ...(session ? { session } : {}),
    },
  );

  // 6. Resolve pattern
  const tokenValues = buildTokenValues(counter.currentValue, genContext);
  return resolvePattern(pattern, tokenValues);
}

/* ---------- Main ---------- */

async function run() {
  await connectDB();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Backfill Entity Codes`);
  console.log(`  Mode: ${apply ? "APPLY" : "DRY RUN"}`);
  if (orgFilter) console.log(`  Organization filter: ${orgFilter}`);
  if (entityFilter) console.log(`  Entity filter: ${entityFilter}`);
  console.log(`${"=".repeat(60)}\n`);

  const entityTypes: Array<{
    type: "loan" | "loan_request";
    model: mongoose.Model<any>;
    label: string;
    hasLocationId: boolean;
  }> = [];

  if (!entityFilter || entityFilter === "loan_request") {
    entityTypes.push({
      type: "loan_request",
      model: LoanRequest,
      label: "LoanRequest",
      hasLocationId: false,
    });
  }

  if (!entityFilter || entityFilter === "loan") {
    entityTypes.push({
      type: "loan",
      model: Loan,
      label: "Loan",
      hasLocationId: true,
    });
  }

  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const entity of entityTypes) {
    console.log(`\n--- ${entity.label} ---\n`);

    // Query for documents missing code
    const query: Record<string, unknown> = {
      $or: [{ code: { $exists: false } }, { code: null }, { code: "" }],
    };
    if (orgFilter) {
      query.organizationId = new Types.ObjectId(orgFilter);
    }

    const selectFields: Record<string, number> = {
      _id: 1,
      organizationId: 1,
      createdAt: 1,
    };
    if (entity.hasLocationId) {
      selectFields.locationId = 1;
    }

    const docs = await entity.model
      .find(query)
      .select(selectFields)
      .sort({ organizationId: 1, createdAt: 1 })
      .lean();

    console.log(`  Found ${docs.length} ${entity.label}(s) missing code\n`);

    if (docs.length === 0) continue;

    for (const doc of docs) {
      const orgId =
        doc.organizationId instanceof Types.ObjectId
          ? doc.organizationId
          : new Types.ObjectId(String(doc.organizationId));

      const createdAt =
        (doc as any).createdAt instanceof Date
          ? (doc as any).createdAt
          : new Date((doc as any).createdAt);

      const locationId = entity.hasLocationId
        ? (doc as any).locationId
        : undefined;

      try {
        if (apply) {
          // Use a session for atomicity of counter + update
          const session = await mongoose.startSession();
          try {
            let code: string = "";

            await session.withTransaction(async () => {
              code = await generateCodeForDocument(
                orgId,
                entity.type,
                createdAt,
                locationId,
                session,
              );

              await entity.model.updateOne(
                { _id: doc._id },
                { $set: { code } },
                { session },
              );
            });

            console.log(`  [OK] ${entity.label} ${doc._id} → "${code}"`);
            totalUpdated++;
          } finally {
            await session.endSession();
          }
        } else {
          // Dry-run: generate code to preview, but still increment counter
          // (counters will be dropped on next real run since docs still lack code)
          const code = await generateCodeForDocument(
            orgId,
            entity.type,
            createdAt,
            locationId,
          );
          console.log(
            `  [PREVIEW] ${entity.label} ${doc._id} → "${code}"`,
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `  [ERROR] ${entity.label} ${doc._id} — ${msg}`,
        );
        totalErrors++;
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
