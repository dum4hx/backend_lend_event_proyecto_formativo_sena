/**
 * scripts/backfill_entity_numbers.ts
 *
 * Backfills auto-generated number fields on existing documents
 * that were created before the code generation system was extended:
 *   - Inspection  → inspectionNumber
 *   - Incident    → incidentNumber
 *   - MaintenanceBatch → batchNumber
 *
 * Strategy:
 *   For each document missing its number field, uses the organization's
 *   default CodeScheme (or the fallback pattern) to generate a code.
 *   The document's `createdAt` is used as the date context so codes
 *   are grouped by the original creation period.
 *
 * Usage (dry-run — no writes):
 *   npx tsx --env-file=.env scripts/backfill_entity_numbers.ts
 *
 * Apply changes:
 *   npx tsx --env-file=.env scripts/backfill_entity_numbers.ts --apply
 *
 * Filter by organization:
 *   npx tsx --env-file=.env scripts/backfill_entity_numbers.ts --apply --org 6650...
 *
 * Filter by entity (inspection | incident | maintenance_batch):
 *   npx tsx --env-file=.env scripts/backfill_entity_numbers.ts --apply --entity inspection
 */

import mongoose, { Types } from "mongoose";
import { connectDB } from "../src/utils/db/connectDB.ts";
import { Inspection } from "../src/modules/inspection/models/inspection.model.ts";
import { Incident } from "../src/modules/incident/models/incident.model.ts";
import { MaintenanceBatch } from "../src/modules/maintenance/models/maintenance_batch.model.ts";
import { CodeScheme } from "../src/modules/code_scheme/models/code_scheme.model.ts";
import { CodeCounter } from "../src/modules/code_scheme/models/code_counter.model.ts";
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
type EntityKey = "inspection" | "incident" | "maintenance_batch";
const entityFilter =
  entityFlag !== -1 && process.argv[entityFlag + 1]
    ? (process.argv[entityFlag + 1] as EntityKey)
    : undefined;

/* ---------- Fallback patterns (same as code_generation.service.ts) ---------- */

const FALLBACK_PATTERNS: Record<EntityKey, string> = {
  inspection: "INSP-{YYYY}-{SEQ:4}",
  incident: "INC-{YYYY}-{SEQ:4}",
  maintenance_batch: "MNT-{YYYY}-{SEQ:4}",
};

const FALLBACK_SCHEME_IDS: Record<EntityKey, Types.ObjectId> = {
  inspection: new Types.ObjectId("000000000000000000000004"),
  incident: new Types.ObjectId("000000000000000000000005"),
  maintenance_batch: new Types.ObjectId("000000000000000000000006"),
};

/* ---------- Code generation (offline, adapted for backfill) ---------- */

async function generateNumberForDocument(
  orgId: Types.ObjectId,
  entityType: EntityKey,
  createdAt: Date,
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

/* ---------- Entity config ---------- */

interface EntityConfig {
  type: EntityKey;
  model: mongoose.Model<any>;
  label: string;
  numberField: string;
}

const ALL_ENTITIES: EntityConfig[] = [
  {
    type: "inspection",
    model: Inspection,
    label: "Inspection",
    numberField: "inspectionNumber",
  },
  {
    type: "incident",
    model: Incident,
    label: "Incident",
    numberField: "incidentNumber",
  },
  {
    type: "maintenance_batch",
    model: MaintenanceBatch as mongoose.Model<any>,
    label: "MaintenanceBatch",
    numberField: "batchNumber",
  },
];

/* ---------- Main ---------- */

async function run() {
  await connectDB();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Backfill Entity Numbers`);
  console.log(`  Mode: ${apply ? "APPLY" : "DRY RUN"}`);
  if (orgFilter) console.log(`  Organization filter: ${orgFilter}`);
  if (entityFilter) console.log(`  Entity filter: ${entityFilter}`);
  console.log(`${"=".repeat(60)}\n`);

  const entities = entityFilter
    ? ALL_ENTITIES.filter((e) => e.type === entityFilter)
    : ALL_ENTITIES;

  let totalUpdated = 0;
  let totalErrors = 0;

  for (const entity of entities) {
    console.log(`\n--- ${entity.label} (${entity.numberField}) ---\n`);

    // Query docs missing the number field
    const query: Record<string, unknown> = {
      $or: [
        { [entity.numberField]: { $exists: false } },
        { [entity.numberField]: null },
        { [entity.numberField]: "" },
      ],
    };
    if (orgFilter) {
      query.organizationId = new Types.ObjectId(orgFilter);
    }

    const docs = await entity.model
      .find(query)
      .select({ _id: 1, organizationId: 1, createdAt: 1 })
      .sort({ organizationId: 1, createdAt: 1 })
      .lean();

    console.log(
      `  Found ${docs.length} ${entity.label}(s) missing ${entity.numberField}\n`,
    );

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

      try {
        if (apply) {
          const session = await mongoose.startSession();
          try {
            let number: string = "";

            await session.withTransaction(async () => {
              number = await generateNumberForDocument(
                orgId,
                entity.type,
                createdAt,
                session,
              );

              await entity.model.updateOne(
                { _id: doc._id },
                { $set: { [entity.numberField]: number } },
                { session },
              );
            });

            console.log(`  [OK] ${entity.label} ${doc._id} → "${number}"`);
            totalUpdated++;
          } finally {
            await session.endSession();
          }
        } else {
          const number = await generateNumberForDocument(
            orgId,
            entity.type,
            createdAt,
          );
          console.log(`  [PREVIEW] ${entity.label} ${doc._id} → "${number}"`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [ERROR] ${entity.label} ${doc._id} — ${msg}`);
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
