/**
 * Report legacy locations without manager assignment.
 *
 * Usage:
 *   npx tsx scripts/report_locations_missing_manager.ts
 *
 * This script DOES NOT mutate data. It generates a report under logs/
 * so the team can perform mandatory manual reassignment before enabling
 * strict manager rules in production.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import mongoose from "mongoose";
import * as dotenv from "dotenv";
import { Location } from "../src/modules/location/models/location.model.ts";

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI ?? process.env.DB_CONNECTION_STRING;

if (!MONGO_URI) {
  console.error(
    "ERROR: Debes definir MONGODB_URI o DB_CONNECTION_STRING para ejecutar este script.",
  );
  process.exit(1);
}

type LegacyLocationRow = {
  _id: string;
  organizationId: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

async function run() {
  await mongoose.connect(MONGO_URI);

  const missingManagerLocations = (await Location.find({
    $or: [{ managerId: { $exists: false } }, { managerId: null }],
  })
    .select("_id organizationId code name isActive createdAt updatedAt")
    .lean()) as LegacyLocationRow[];

  const report = {
    generatedAt: new Date().toISOString(),
    totalInvalidLocations: missingManagerLocations.length,
    strategy:
      "Asignación manual obligatoria: cada sede inválida debe recibir managerId válido antes de cualquier actualización funcional.",
    locations: missingManagerLocations.map((loc) => ({
      _id: loc._id.toString(),
      organizationId: loc.organizationId.toString(),
      code: loc.code,
      name: loc.name,
      isActive: loc.isActive,
      createdAt: loc.createdAt,
      updatedAt: loc.updatedAt,
    })),
  };

  mkdirSync("logs", { recursive: true });
  const reportPath = join(
    "logs",
    `locations-missing-manager-report-${Date.now()}.json`,
  );
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

  console.log(`Reporte generado: ${reportPath}`);
  console.log(
    `Total de ubicaciones inválidas (sin managerId): ${report.totalInvalidLocations}`,
  );

  await mongoose.disconnect();

  if (report.totalInvalidLocations > 0) {
    process.exitCode = 2;
  }
}

run().catch(async (error) => {
  console.error("Error generando reporte de ubicaciones legacy:", error);
  await mongoose.disconnect();
  process.exit(1);
});
