/**
 * scripts/sync_default_role_permissions.ts
 *
 * Finds all Role documents in the database whose `name` matches one of the
 * default organization role definitions (`defaultOrganizationRoleDefs` from
 * `role.model.ts`) and updates their `permissions` array to match the
 * canonical set defined in code.
 *
 * This covers all four default roles:
 *   - Propietario
 *   - Gerente
 *   - Operador de almacén
 *   - Asesor comercial
 *
 * Usage (dry-run — no writes):
 *   npx tsx --env-file=.env scripts/sync_default_role_permissions.ts
 *
 * Apply changes:
 *   npx tsx --env-file=.env scripts/sync_default_role_permissions.ts --apply
 *
 * Filter to a single organization:
 *   npx tsx --env-file=.env scripts/sync_default_role_permissions.ts --apply --org <orgId>
 *
 * CI-friendly mode (exit 1 if any diffs found):
 *   npx tsx --env-file=.env scripts/sync_default_role_permissions.ts --fail-on-diff
 */

import mongoose, { Types } from "mongoose";
import { connectDB } from "../src/utils/db/connectDB.ts";
import {
  Role,
  defaultOrganizationRoleDefs,
} from "../src/modules/roles/models/role.model.ts";

/* ---------- CLI flags ---------- */

const apply = process.argv.includes("--apply");
const failOnDiff = process.argv.includes("--fail-on-diff");

const orgFlagIdx = process.argv.indexOf("--org");
const orgFilter =
  orgFlagIdx !== -1 && process.argv[orgFlagIdx + 1]
    ? process.argv[orgFlagIdx + 1]
    : undefined;

/* ---------- Helpers ---------- */

function canonicalize(arr: readonly string[]): string[] {
  return Array.from(new Set(arr)).sort();
}

/* ---------- Main ---------- */

async function main() {
  if (!apply) {
    console.log(
      "DRY-RUN mode — no writes. Rerun with --apply to apply changes.\n",
    );
  }

  if (orgFilter && !Types.ObjectId.isValid(orgFilter)) {
    console.error("Invalid --org value:", orgFilter);
    process.exit(2);
  }

  await connectDB();

  // Build a map: roleName → canonical permissions
  const canonicalByName = new Map<string, string[]>(
    defaultOrganizationRoleDefs.map((def) => [
      def.name,
      canonicalize(def.permissions),
    ]),
  );

  const roleNames = [...canonicalByName.keys()];

  const query: Record<string, unknown> = {
    name: { $in: roleNames },
  };
  if (orgFilter) {
    query.organizationId = new Types.ObjectId(orgFilter);
  }

  const roles = await Role.find(query).exec();

  if (!roles.length) {
    console.log("No default roles found matching the provided criteria.");
    await mongoose.disconnect();
    return;
  }

  console.log(
    `Found ${roles.length} role(s) across ${new Set(roles.map((r) => String(r.organizationId))).size} organization(s).\n`,
  );

  let anyDiff = false;
  let updatedCount = 0;

  for (const role of roles) {
    const canonical = canonicalByName.get(role.name);
    if (!canonical) continue;

    const current = canonicalize(role.permissions ?? []);

    const missing = canonical.filter((p) => !current.includes(p));
    const extra = current.filter((p) => !canonical.includes(p));

    if (missing.length === 0 && extra.length === 0) {
      console.log(
        `OK: "${role.name}" (role=${role._id}, org=${role.organizationId ?? "N/A"}) — in sync`,
      );
      continue;
    }

    anyDiff = true;
    console.log(
      `\nDIFF: "${role.name}" (role=${role._id}, org=${role.organizationId ?? "N/A"}):`,
    );
    if (missing.length)
      console.log(`  Missing (${missing.length}):`, missing.join(", "));
    if (extra.length)
      console.log(`  Extra   (${extra.length}):`, extra.join(", "));

    if (apply) {
      role.permissions = canonical;
      try {
        await role.save();
        updatedCount++;
        console.log(`  → Updated permissions for "${role.name}".`);
      } catch (err) {
        console.error(`  ✗ Failed to update "${role.name}":`, err);
      }
    } else {
      console.log("  (Dry-run) Rerun with --apply to update.");
    }
  }

  await mongoose.disconnect();

  /* ---------- Summary ---------- */
  console.log("\n--- Summary ---");
  console.log(`Roles checked : ${roles.length}`);
  console.log(`With diffs    : ${anyDiff ? "yes" : "no"}`);
  if (apply) console.log(`Updated       : ${updatedCount}`);

  if (anyDiff && failOnDiff && !apply) {
    console.error(
      "\nDifferences found. Rerun with --apply to fix, or combine --fail-on-diff with --apply in CI.",
    );
    process.exit(3);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
