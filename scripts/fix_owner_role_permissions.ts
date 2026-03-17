/**
 * scripts/fix_owner_role_permissions.ts
 *
 * Find `Role` documents where `name === "owner"` and `isReadOnly === true`
 * and ensure their `permissions` array exactly matches the canonical
 * `rolePermissions.owner` defined in `src/modules/roles/models/role.model.ts`.
 *
 * Usage (dry-run):
 *   npx tsx scripts/fix_owner_role_permissions.ts
 *
 * Apply changes:
 *   npx tsx scripts/fix_owner_role_permissions.ts --apply
 *
 * Filter by organization:
 *   npx tsx scripts/fix_owner_role_permissions.ts --org <orgId>
 *
 * CI-friendly mode (exit 1 if any diffs found):
 *   npx tsx scripts/fix_owner_role_permissions.ts --fail-on-diff
 */

import mongoose, { Types } from "mongoose";
import { connectDB } from "../src/utils/db/connectDB.ts";
import {
  Role,
  rolePermissions,
} from "../src/modules/roles/models/role.model.ts";

type Flags = {
  apply: boolean;
  org?: string;
  failOnDiff: boolean;
};

function parseArgs(): Flags {
  const args = process.argv.slice(2);
  const flags: Flags = { apply: false, failOnDiff: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--apply") flags.apply = true;
    if (a === "--fail-on-diff") flags.failOnDiff = true;
    if (a === "--org" && args[i + 1]) {
      flags.org = args[i + 1];
      i++;
    }
  }
  return flags;
}

function canonicalize(arr: readonly string[]) {
  return Array.from(new Set(arr)).sort();
}

async function main() {
  const { apply, org, failOnDiff } = parseArgs();

  await connectDB();

  const query: any = { name: "owner", isReadOnly: true };
  if (org) {
    if (!Types.ObjectId.isValid(org)) {
      console.error("Invalid organization id provided to --org");
      process.exit(2);
    }
    query.organizationId = new Types.ObjectId(org);
  }

  const roles = await Role.find(query).exec();
  if (!roles.length) {
    console.log("No read-only 'owner' roles found with the provided criteria.");
    await mongoose.disconnect();
    return;
  }

  const canonical = canonicalize(rolePermissions.owner);

  let anyDiff = false;

  for (const role of roles) {
    const current = canonicalize(role.permissions ?? []);

    const missing = canonical.filter((p) => !current.includes(p));
    const extra = current.filter((p) => !canonical.includes(p));

    if (missing.length === 0 && extra.length === 0) {
      console.log(
        `OK: role ${role._id.toString()} (org=${role.organizationId ?? "N/A"}) is in sync`,
      );
      continue;
    }

    anyDiff = true;
    console.log(
      `\nDIFF for role ${role._id.toString()} (org=${role.organizationId ?? "N/A"}):`,
    );
    if (missing.length)
      console.log(`  Missing (${missing.length}):`, missing.join(", "));
    if (extra.length)
      console.log(`  Extra   (${extra.length}):`, extra.join(", "));

    if (apply) {
      role.permissions = canonical;
      try {
        await role.save();
        console.log("  → Updated role permissions to canonical owner set.");
      } catch (err) {
        console.error("  ✗ Failed to update:", err);
      }
    } else {
      console.log("  (Dry-run) Run with --apply to update this role.");
    }
  }

  await mongoose.disconnect();

  if (anyDiff && failOnDiff && !apply) {
    console.error(
      "Differences found. Rerun with --apply to fix or use --fail-on-diff with --apply in CI.",
    );
    process.exit(3);
  }

  if (anyDiff && failOnDiff && apply) {
    // If apply was used and differences existed, exit 0 (applied changes)
    process.exit(0);
  }

  if (anyDiff) {
    console.log("Completed with differences reported.");
  } else {
    console.log("All checked owner roles are already in sync.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
