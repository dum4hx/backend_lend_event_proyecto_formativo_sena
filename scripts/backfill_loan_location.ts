/**
 * scripts/backfill_loan_location.ts
 *
 * Backfills the `locationId` field on existing Loan documents that were
 * created before the field was added to the schema.
 *
 * Strategy:
 *   For each loan missing `locationId`, look up the first material instance
 *   in `loan.materialInstances` and copy its `locationId` to the loan.
 *
 * Usage (dry-run — no writes):
 *   npx tsx --env-file=.env scripts/backfill_loan_location.ts
 *
 * Apply changes:
 *   npx tsx --env-file=.env scripts/backfill_loan_location.ts --apply
 */

import mongoose, { Types } from "mongoose";
import { connectDB } from "../src/utils/db/connectDB.ts";
import { Loan } from "../src/modules/loan/models/loan.model.ts";
import { MaterialInstance } from "../src/modules/material/models/material_instance.model.ts";

const apply = process.argv.includes("--apply");

async function run() {
  await connectDB();
  console.log(`\nMode: ${apply ? "APPLY" : "DRY RUN"}\n`);

  // Find all loans without a locationId
  const loans = await Loan.find({ locationId: { $exists: false } })
    .select("_id materialInstances")
    .lean();

  console.log(`Found ${loans.length} loan(s) missing locationId`);

  let updated = 0;
  let skipped = 0;

  for (const loan of loans) {
    const firstInstanceId = (loan as any).materialInstances?.[0]
      ?.materialInstanceId;

    if (!firstInstanceId) {
      console.warn(`  [SKIP] Loan ${loan._id} — no material instances`);
      skipped++;
      continue;
    }

    const instance = await MaterialInstance.findById(firstInstanceId)
      .select("locationId")
      .lean();

    if (!instance?.locationId) {
      console.warn(
        `  [SKIP] Loan ${loan._id} — instance ${firstInstanceId} has no locationId`,
      );
      skipped++;
      continue;
    }

    console.log(`  Loan ${loan._id} → locationId = ${instance.locationId}`);

    if (apply) {
      await Loan.updateOne(
        { _id: loan._id },
        { $set: { locationId: instance.locationId } },
      );
      updated++;
    }
  }

  console.log(
    `\nDone. ${apply ? `Updated: ${updated}` : "Dry-run (no writes)"} | Skipped: ${skipped}`,
  );

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
