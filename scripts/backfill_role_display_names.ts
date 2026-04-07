/**
 * scripts/backfill_role_display_names.ts
 *
 * Renames existing Role documents whose `name` matches one of the old English
 * default role names, replacing them with the canonical Spanish names now
 * defined in `defaultOrganizationRoleDefs`.
 *
 * Old → New mapping:
 *   owner              → Propietario
 *   manager            → Gerente
 *   warehouse_operator → Operador de almacén
 *   commercial_advisor → Asesor comercial
 *
 * Only updates roles whose `name` still holds the old English value.
 * Idempotent: roles already carrying the Spanish name are skipped.
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
import { Role } from "../src/modules/roles/models/role.model.ts";

/* ---------- CLI flags ---------- */

const apply = process.argv.includes("--apply");

const orgFlagIdx = process.argv.indexOf("--org");
const orgFilter =
  orgFlagIdx !== -1 && process.argv[orgFlagIdx + 1]
    ? process.argv[orgFlagIdx + 1]
    : undefined;

/* ---------- Name migration map ---------- */

const NAME_MIGRATIONS: Record<string, string> = {
  owner: "Propietario",
  manager: "Gerente",
  warehouse_operator: "Operador de almacén",
  commercial_advisor: "Asesor comercial",
};

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
    name: { $in: Object.keys(NAME_MIGRATIONS) },
  };

  if (orgFilter) {
    roleQuery.organizationId = new Types.ObjectId(orgFilter);
  }

  const roles = await Role.find(roleQuery)
    .select("_id name organizationId")
    .lean();

  console.log(`Found ${roles.length} role(s) to rename.\n`);

  let updatedCount = 0;

  for (const role of roles) {
    const newName = NAME_MIGRATIONS[role.name as string];
    const label = `role[${role._id}] org=${role.organizationId ?? "N/A"}`;

    console.log(
      `  ${apply ? "RENAME" : "WOULD RENAME"} ${label}: "${role.name}" → "${newName}"`,
    );

    if (apply) {
      await Role.updateOne({ _id: role._id }, { $set: { name: newName } });
    }

    updatedCount++;
  }

  console.log(
    `\nDone. ${apply ? "Renamed" : "Would rename"} ${updatedCount} role(s).`,
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Script failed:", err);
  mongoose.disconnect().finally(() => process.exit(1));
});
