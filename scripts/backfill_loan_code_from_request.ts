/**
 * scripts/backfill_loan_code_from_request.ts
 *
 * Actualiza el campo `code` de todos los Loan existentes para que coincida
 * con el `code` de la LoanRequest a la que pertenecen (vía `requestId`).
 *
 * Esto es necesario tras unificar los esquemas de código de solicitudes y
 * préstamos: a partir de ahora ambos comparten el mismo esquema "loan" y el
 * préstamo hereda el código de su solicitud.
 *
 * Uso (simulación sin escrituras):
 *   npx tsx --env-file=.env scripts/backfill_loan_code_from_request.ts
 *
 * Aplicar cambios:
 *   npx tsx --env-file=.env scripts/backfill_loan_code_from_request.ts --apply
 */

import mongoose from "mongoose";
import { connectDB } from "../src/utils/db/connectDB.ts";
import { Loan } from "../src/modules/loan/models/loan.model.ts";
import { LoanRequest } from "../src/modules/request/models/request.model.ts";

const apply = process.argv.includes("--apply");

async function run() {
  await connectDB();
  console.log(`\nModo: ${apply ? "APLICAR" : "SIMULACIÓN (sin escrituras)"}\n`);

  const loans = await Loan.find({ requestId: { $exists: true } })
    .select("_id code requestId")
    .lean();

  console.log(`Préstamos encontrados con requestId: ${loans.length}`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const loan of loans) {
    const request = await LoanRequest.findById(loan.requestId)
      .select("code")
      .lean();

    if (!request) {
      console.warn(
        `  [OMITIR] Loan ${loan._id} — solicitud ${loan.requestId} no encontrada`,
      );
      skipped++;
      continue;
    }

    if (loan.code === request.code) {
      console.log(
        `  [SIN CAMBIO] Loan ${loan._id} — code ya es "${loan.code}"`,
      );
      skipped++;
      continue;
    }

    console.log(
      `  Loan ${loan._id}: "${loan.code}" → "${request.code}" (solicitud: ${loan.requestId})`,
    );

    if (apply) {
      try {
        // Bypass the immutable flag using updateOne at DB level
        await Loan.collection.updateOne(
          { _id: loan._id },
          { $set: { code: request.code } },
        );
        updated++;
      } catch (err: any) {
        console.error(`  [ERROR] Loan ${loan._id}: ${err.message}`);
        errors++;
      }
    }
  }

  console.log("\n--- Resumen ---");
  if (apply) {
    console.log(`  Actualizados : ${updated}`);
    console.log(`  Omitidos     : ${skipped}`);
    console.log(`  Errores      : ${errors}`);
  } else {
    console.log(`  Se actualizarían : ${loans.length - skipped}`);
    console.log(`  Omitidos         : ${skipped}`);
    console.log("  (Ejecuta con --apply para aplicar los cambios)");
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
