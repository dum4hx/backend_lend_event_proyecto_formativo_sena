/**
 * seeders/permissions.seeder.ts
 *
 * Seeds the Permission collection from the canonical permissions.json source of truth.
 * Run with: npx tsx src/modules/roles/seeders/permissions.seeder.ts
 * Dry run:  DRY_RUN=1 npx tsx src/modules/roles/seeders/permissions.seeder.ts
 */

import mongoose from "mongoose";
import {
  Permission,
  PermissionZodSchema,
  type PermissionInput,
} from "../models/permissions.model.ts";
import { connectDB } from "../../../utils/db/connectDB.ts";
import permissionsData from "./permissions.json" with { type: "json" };

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

/** Upsert a single permission (core fields + isPlatformPermission). */
async function upsertPermission(
  p: PermissionInput & { isPlatformPermission: boolean },
) {
  if (DRY_RUN) {
    console.log("[DRY RUN] upsert:", p._id);
    return;
  }

  await Permission.updateOne(
    { _id: p._id },
    {
      $set: {
        displayName: p.displayName,
        description: p.description,
        category: p.category,
        isActive: p.isActive,
        isPlatformPermission: p.isPlatformPermission,
      },
    },
    { upsert: true },
  );
}

/** Main seed runner */
async function run() {
  await connectDB();
  console.log(`Seeding ${permissionsData.length} permission(s)…`);

  let seeded = 0;
  let failed = 0;

  for (const entry of permissionsData) {
    // Validate core schema fields with Zod (isActive defaults to true when absent)
    const result = PermissionZodSchema.safeParse({
      _id: entry._id,
      displayName: entry.displayName,
      description: entry.description,
      category: entry.category,
    });

    if (!result.success) {
      console.error(
        `Validation failed for "${entry._id}":`,
        result.error.flatten().fieldErrors,
      );
      failed++;
      continue;
    }

    try {
      await upsertPermission({
        ...result.data,
        isPlatformPermission: entry.isPlatformPermission ?? false,
      });
      console.log(`  ✓ ${entry._id}`);
      seeded++;
    } catch (err) {
      console.error(`  ✗ ${entry._id}:`, err);
      failed++;
    }
  }

  console.log(`\nDone. ${seeded} seeded, ${failed} failed.`);

  if (!DRY_RUN) {
    await mongoose.disconnect();
  }
}

export { run };

run();
