import mongoose, { Types } from "mongoose";
import { connectDB } from "../src/utils/db/connectDB.ts";
import { LocationService } from "../src/modules/location/location.service.ts";

type Flags = {
  apply: boolean;
  org?: string;
  location?: string;
};

function parseArgs(): Flags {
  const args = process.argv.slice(2);
  const flags: Flags = { apply: false };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--apply") {
      flags.apply = true;
      continue;
    }

    if (arg === "--org" && args[i + 1]) {
      flags.org = args[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--location" && args[i + 1]) {
      flags.location = args[i + 1];
      i += 1;
      continue;
    }
  }

  return flags;
}

function validateObjectId(value: string, label: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) {
    throw new Error(`${label} no es un ObjectId válido: ${value}`);
  }

  return new Types.ObjectId(value);
}

async function main() {
  const { apply, org, location } = parseArgs();

  if (!apply) {
    console.log("DRY-RUN mode: no se aplicarán cambios. Usa --apply para persistir.");
  }

  if (!org) {
    throw new Error("Debes enviar --org <organizationId>");
  }

  const organizationId = validateObjectId(org, "organizationId");
  const locationIds = location
    ? [validateObjectId(location, "locationId")]
    : undefined;

  await connectDB();

  try {
    if (!apply) {
      const result = await LocationService.recalculateMaterialCapacitiesCurrentQuantity({
        organizationId,
        locationIds,
      });
      console.log(
        `DRY-RUN completado. Se recalcularían ${result.processed} sede(s).`,
      );
      return;
    }

    const result = await LocationService.recalculateMaterialCapacitiesCurrentQuantity({
      organizationId,
      locationIds,
    });

    console.log(`Recalculo aplicado correctamente en ${result.processed} sede(s).`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("Error ejecutando recalculate_location_occupancy:", error);
  process.exit(1);
});
