/**
 * scripts/backfill_pricing.ts
 *
 * Backfills the Multi-Pricing System changes for all existing organizations:
 *
 *   1. Creates a default org-level `per_day` PricingConfig for every organization
 *      that does not already have one (idempotent upsert).
 *
 *   2. Ensures each organization's roles contain the new `pricing:read` and
 *      `pricing:manage` permissions according to the canonical rolePermissions map.
 *
 * Usage (dry-run — no writes):
 *   npx tsx --env-file=.env scripts/backfill_pricing.ts
 *
 * Apply changes:
 *   npx tsx --env-file=.env scripts/backfill_pricing.ts --apply
 *
 * Filter to a single organization:
 *   npx tsx --env-file=.env scripts/backfill_pricing.ts --apply --org <orgId>
 */

import mongoose, { Types } from "mongoose";
import { connectDB } from "../src/utils/db/connectDB.ts";
import { Organization } from "../src/modules/organization/models/organization.model.ts";
import { PricingConfig } from "../src/modules/pricing/models/pricing_config.model.ts";
import {
  Role,
  rolePermissions,
} from "../src/modules/roles/models/role.model.ts";

/* ---------- CLI flags ---------- */

type Flags = { apply: boolean; org?: string };

function parseArgs(): Flags {
  const args = process.argv.slice(2);
  const flags: Flags = { apply: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--apply") flags.apply = true;
    if (args[i] === "--org" && args[i + 1]) {
      flags.org = args[i + 1];
      i++;
    }
  }
  return flags;
}

/* ---------- Helpers ---------- */

/** Permissions to add per role name */
const ROLE_PERMISSION_ADDITIONS: Record<string, string[]> = {
  owner: ["pricing:read", "pricing:manage"],
  manager: ["pricing:read", "pricing:manage"],
  warehouse_operator: ["pricing:read"],
  commercial_advisor: ["pricing:read"],
};

/* ---------- Main ---------- */

async function main() {
  const { apply, org } = parseArgs();

  if (!apply) {
    console.log(
      "DRY-RUN mode — no writes. Rerun with --apply to apply changes.\n",
    );
  }

  await connectDB();

  /* ── Build org list ── */
  const orgQuery: any = {};
  if (org) {
    if (!Types.ObjectId.isValid(org)) {
      console.error("Invalid --org value:", org);
      await mongoose.disconnect();
      process.exit(2);
    }
    orgQuery._id = new Types.ObjectId(org);
  }

  const organizations = await Organization.find(orgQuery)
    .select("_id name")
    .lean();
  console.log(`Found ${organizations.length} organization(s) to process.\n`);

  let pricingSeedCount = 0;
  let pricingSkipCount = 0;
  let roleUpdateCount = 0;
  let roleSkipCount = 0;

  for (const o of organizations) {
    const orgId = o._id as Types.ObjectId;
    const label = `org[${orgId}] "${(o as any).name ?? "?"}"`;

    /* ── 1. Default PricingConfig ── */
    const existing = await PricingConfig.findOne({
      organizationId: orgId,
      scope: "organization",
      referenceId: orgId,
    }).lean();

    if (existing) {
      console.log(`  [pricing] SKIP ${label} — default config already exists`);
      pricingSkipCount++;
    } else {
      console.log(
        `  [pricing] ${apply ? "CREATE" : "WOULD CREATE"} default per_day config for ${label}`,
      );
      if (apply) {
        await PricingConfig.findOneAndUpdate(
          { organizationId: orgId, scope: "organization", referenceId: orgId },
          {
            $setOnInsert: {
              organizationId: orgId,
              scope: "organization",
              referenceId: orgId,
              strategyType: "per_day",
            },
          },
          { upsert: true, new: true },
        );
      }
      pricingSeedCount++;
    }

    /* ── 2. Role permission additions ── */
    const roles = await Role.find({ organizationId: orgId }).lean();

    for (const role of roles) {
      const additions = ROLE_PERMISSION_ADDITIONS[role.name];
      if (!additions || additions.length === 0) continue;

      const currentSet = new Set(role.permissions ?? []);
      const toAdd = additions.filter((p) => !currentSet.has(p));

      if (toAdd.length === 0) {
        console.log(
          `  [roles]   SKIP ${label} — "${role.name}" already has all pricing permissions`,
        );
        roleSkipCount++;
        continue;
      }

      console.log(
        `  [roles]   ${apply ? "ADD" : "WOULD ADD"} [${toAdd.join(", ")}] → "${role.name}" (${label})`,
      );

      if (apply) {
        await Role.updateOne(
          { _id: role._id },
          { $addToSet: { permissions: { $each: toAdd } } },
        );
      }
      roleUpdateCount++;
    }

    /* ── Additionally sync read-only roles to canonical permission list ── */
    const readOnlyRoles = await Role.find({
      organizationId: orgId,
      isReadOnly: true,
    }).lean();

    for (const role of readOnlyRoles) {
      const canonical =
        rolePermissions[role.name as keyof typeof rolePermissions];
      if (!canonical) continue;

      const canonicalSet = new Set(canonical);
      const currentSet = new Set(role.permissions ?? []);
      const toAdd = canonical.filter((p) => !currentSet.has(p));

      if (toAdd.length === 0) {
        continue; // already in sync
      }

      console.log(
        `  [roles]   ${apply ? "SYNC" : "WOULD SYNC"} read-only "${role.name}" → adding [${toAdd.join(", ")}] (${label})`,
      );

      if (!apply) continue;

      // For read-only (SYSTEM) roles keep the canonical set exactly
      await Role.updateOne(
        { _id: role._id },
        { $set: { permissions: Array.from(canonicalSet) } },
      );
      roleUpdateCount++;
    }
  }

  /* ── Summary ── */
  console.log("\n── Summary ──────────────────────────────────────");
  console.log(
    `  PricingConfig: ${pricingSeedCount} ${apply ? "created" : "would create"}, ${pricingSkipCount} skipped`,
  );
  console.log(
    `  Roles: ${roleUpdateCount} ${apply ? "updated" : "would update"}, ${roleSkipCount} skipped`,
  );

  if (!apply) {
    console.log("\n  Run with --apply to apply these changes to the database.");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
