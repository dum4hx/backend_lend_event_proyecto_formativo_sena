/**
 * scripts/backfill_role_display_names.ts
 *
 * Backfills the `displayName` field on existing Role documents whose `name`
 * matches one of the default organization roles, setting the Spanish display
 * name defined in `defaultOrganizationRoleDefs`.
 *
 * Only updates roles that are missing `displayName` or have an empty value.
 * Roles with a custom (non-default) name are not touched.
 *
 * Usage (dry-run — no writes):
 *   npx tsx --env-file=.env scripts/backfill_role_display_names.ts
 *
 * Apply changes:
 *   npx tsx --env-file=.env scripts/backfill_role_display_names.ts --apply
 *
 * Filter to a single organization:
 *   npx tsx --env-file=.env scripts/backfill_role_display_names.ts --apply --org <orgId>
 */

import mongoose, { Types } from "mongoose";
import { connectDB } from "../src/utils/db/connectDB.ts";
import {
  Role,
  defaultOrganizationRoleDefs,
} from "../src/modules/roles/models/role.model.ts";

/* ---------- CLI flags ---------- */

const apply = process.argv.includes("--apply");

const orgFlagIdx = process.argv.indexOf("--org");
const orgFilter =
  orgFlagIdx !== -1 && process.argv[orgFlagIdx + 1]
    ? process.argv[orgFlagIdx + 1]
    : undefined;

/* ---------- Derived lookup: name → displayName ---------- */

const DEFAULT_DISPLAY_NAMES: Record<string, string> = Object.fromEntries(
  defaultOrganizationRoleDefs.map((def) => [def.name, def.displayName]),
);

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

  const roleQuery: Record<string, unknown> = {
    name: { $in: Object.keys(DEFAULT_DISPLAY_NAMES) },
    $or: [{ displayName: { $exists: false } }, { displayName: "" }],
  };

  if (orgFilter) {
    roleQuery.organizationId = new Types.ObjectId(orgFilter);
  }

  const roles = await Role.find(roleQuery)
    .select("_id name organizationId displayName")
    .lean();

  console.log(`Found ${roles.length} role(s) to update.\n`);

  let updatedCount = 0;

  for (const role of roles) {
    const newDisplayName = DEFAULT_DISPLAY_NAMES[role.name as string];
    const label = `role[${role._id}] name="${role.name}" org=${role.organizationId ?? "N/A"}`;

    console.log(
      `  ${apply ? "UPDATE" : "WOULD UPDATE"} ${label} → displayName="${newDisplayName}"`,
    );

    if (apply) {
      await Role.updateOne(
        { _id: role._id },
        { $set: { displayName: newDisplayName } },
      );
    }

    updatedCount++;
  }

  console.log(
    `\nDone. ${apply ? "Updated" : "Would update"} ${updatedCount} role(s).`,
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Script failed:", err);
  mongoose.disconnect().finally(() => process.exit(1));
});
