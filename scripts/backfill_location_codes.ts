/**
 * scripts/backfill_location_codes.ts
 *
 * Backfills the `code` field on existing Location documents that were
 * created before the field was added to the schema.
 *
 * Strategy:
 *   For each location missing `code`, generate it from the location name:
 *   - Take first 3 consonants of the uppercased name (or fill with vowels).
 *   - Append a 3-digit sequential number per organization.
 *   - Result: e.g. "BDG001", "WHR002", "OFC003"
 *   If the generated code collides with an existing one, increment the suffix.
 *
 * Usage (dry-run — no writes):
 *   npx tsx --env-file=.env scripts/backfill_location_codes.ts
 *
 * Apply changes:
 *   npx tsx --env-file=.env scripts/backfill_location_codes.ts --apply
 *
 * Filter by organization:
 *   npx tsx --env-file=.env scripts/backfill_location_codes.ts --apply --org 6650...
 */

import mongoose from "mongoose";
import { connectDB } from "../src/utils/db/connectDB.ts";
import { Location } from "../src/modules/location/models/location.model.ts";

const apply = process.argv.includes("--apply");
const orgFlag = process.argv.indexOf("--org");
const orgFilter =
  orgFlag !== -1 && process.argv[orgFlag + 1]
    ? process.argv[orgFlag + 1]
    : undefined;

/**
 * Derive a 3-letter prefix from the location name.
 * Takes uppercase consonants first, then vowels, then pads with "X".
 */
function derivePrefix(name: string): string {
  const upper = name.toUpperCase().replace(/[^A-Z]/g, "");
  const consonants = upper.replace(/[AEIOU]/g, "");
  const vowels = upper.replace(/[^AEIOU]/g, "");
  const pool = consonants + vowels;
  return (pool + "XXX").slice(0, 3);
}

async function run() {
  await connectDB();
  console.log(`\nMode: ${apply ? "APPLY" : "DRY RUN"}`);
  if (orgFilter) console.log(`Organization filter: ${orgFilter}`);
  console.log();

  // Build query for locations missing code
  const query: Record<string, unknown> = {
    $or: [{ code: { $exists: false } }, { code: null }, { code: "" }],
  };
  if (orgFilter) {
    query.organizationId = new mongoose.Types.ObjectId(orgFilter);
  }

  const locations = await Location.find(query)
    .select("_id name organizationId")
    .sort({ organizationId: 1, createdAt: 1 })
    .lean();

  console.log(`Found ${locations.length} location(s) missing code\n`);

  if (locations.length === 0) {
    await mongoose.disconnect();
    return;
  }

  // Group by organization
  const byOrg = new Map<string, typeof locations>();
  for (const loc of locations) {
    const orgId = String(loc.organizationId);
    if (!byOrg.has(orgId)) byOrg.set(orgId, []);
    byOrg.get(orgId)!.push(loc);
  }

  let updated = 0;

  for (const [orgId, orgLocations] of byOrg) {
    console.log(`  Organization ${orgId} — ${orgLocations.length} location(s)`);

    // Fetch existing codes for this org to avoid collisions
    const existingCodes = new Set(
      (
        await Location.find(
          {
            organizationId: new mongoose.Types.ObjectId(orgId),
            code: { $exists: true, $nin: [null, ""] },
          },
          { code: 1 },
        ).lean()
      ).map((l) => l.code as string),
    );

    let seq = existingCodes.size; // Start after existing codes

    for (const loc of orgLocations) {
      const prefix = derivePrefix(loc.name);
      let code: string;

      // Find a unique code
      do {
        seq++;
        code = `${prefix}${String(seq).padStart(3, "0")}`;
      } while (existingCodes.has(code));

      existingCodes.add(code);

      console.log(
        `    ${loc.name} (${loc._id}) → code = "${code}"`,
      );

      if (apply) {
        await Location.updateOne(
          { _id: loc._id },
          { $set: { code } },
        );
        updated++;
      }
    }
  }

  console.log(
    `\nDone. ${apply ? `Updated: ${updated}` : "Dry-run (no writes)"} | Total: ${locations.length}`,
  );

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
