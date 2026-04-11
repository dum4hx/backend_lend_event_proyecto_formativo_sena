/**
 * scripts/backfill_request_location_from_loan.ts
 *
 * Establece el campo `locationId` en todas las LoanRequest que no lo tengan
 * (o que esté vacío), tomando el valor del Loan vinculado a través del campo
 * `loanId` de la solicitud.
 *
 * Casos cubiertos:
 *  - Solicitudes sin `locationId` (campo ausente o null).
 *  - Solicitudes cuyo `loanId` apunta a un Loan con `locationId` definido.
 *
 * Casos omitidos (se reportan en consola):
 *  - Solicitudes sin `loanId` (aún no tienen préstamo asociado).
 *  - Solicitudes cuyo Loan no existe o no tiene `locationId`.
 *
 * Uso (simulación sin escrituras):
 *   npx tsx --env-file=.env scripts/backfill_request_location_from_loan.ts
 *
 * Aplicar cambios:
 *   npx tsx --env-file=.env scripts/backfill_request_location_from_loan.ts --apply
 */

import mongoose from "mongoose";
import { connectDB } from "../src/utils/db/connectDB.ts";
import { Loan } from "../src/modules/loan/models/loan.model.ts";
import { LoanRequest } from "../src/modules/request/models/request.model.ts";

const apply = process.argv.includes("--apply");

async function run() {
  await connectDB();
  console.log(`\nModo: ${apply ? "APLICAR" : "SIMULACIÓN (sin escrituras)"}\n`);

  // Find all requests missing locationId
  const requests = await LoanRequest.find({
    $or: [{ locationId: { $exists: false } }, { locationId: null }],
  })
    .select("_id code locationId loanId")
    .lean();

  console.log(`Solicitudes sin locationId: ${requests.length}`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const request of requests) {
    if (!request.loanId) {
      console.warn(
        `  [OMITIR] Solicitud ${request._id} (${request.code ?? "sin código"}) — no tiene loanId asignado`,
      );
      skipped++;
      continue;
    }

    const loan = await Loan.findById(request.loanId)
      .select("_id locationId")
      .lean();

    if (!loan) {
      console.warn(
        `  [OMITIR] Solicitud ${request._id} (${request.code ?? "sin código"}) — préstamo ${request.loanId} no encontrado`,
      );
      skipped++;
      continue;
    }

    if (!loan.locationId) {
      console.warn(
        `  [OMITIR] Solicitud ${request._id} (${request.code ?? "sin código"}) — el préstamo ${loan._id} tampoco tiene locationId`,
      );
      skipped++;
      continue;
    }

    console.log(
      `  Solicitud ${request._id} (${request.code ?? "sin código"}): locationId → ${loan.locationId} (préstamo: ${loan._id})`,
    );

    if (apply) {
      try {
        await LoanRequest.collection.updateOne(
          { _id: request._id },
          { $set: { locationId: loan.locationId } },
        );
        updated++;
      } catch (err: any) {
        console.error(`  [ERROR] Solicitud ${request._id}: ${err.message}`);
        errors++;
      }
    }
  }

  console.log("\n--- Resumen ---");
  if (apply) {
    console.log(`  Actualizadas : ${updated}`);
    console.log(`  Omitidas     : ${skipped}`);
    console.log(`  Errores      : ${errors}`);
  } else {
    console.log(`  Se actualizarían : ${requests.length - skipped}`);
    console.log(`  Omitidas         : ${skipped}`);
    console.log("  (Ejecuta con --apply para aplicar los cambios)");
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
