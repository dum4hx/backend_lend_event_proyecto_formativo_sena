import { Types, type ClientSession } from "mongoose";
import {
  CodeScheme,
  type CodeSchemeInput,
  type CodeSchemeUpdateInput,
  type EntityType,
} from "./models/code_scheme.model.ts";
import { validatePattern } from "./code_pattern.utils.ts";
import { AppError } from "../../errors/AppError.ts";

/* ---------- Helpers ---------- */

function toObjectId(id: string | Types.ObjectId): Types.ObjectId {
  return typeof id === "string" ? new Types.ObjectId(id) : id;
}

/* ---------- List ---------- */

async function listSchemes(
  organizationId: string | Types.ObjectId,
  filters?: { entityType?: EntityType },
) {
  const query: Record<string, unknown> = {
    organizationId: toObjectId(organizationId),
  };
  if (filters?.entityType) {
    query.entityType = filters.entityType;
  }

  const schemes = await CodeScheme.find(query)
    .sort({ entityType: 1, name: 1 })
    .lean();

  return schemes;
}

/* ---------- Get ---------- */

async function getSchemeById(
  organizationId: string | Types.ObjectId,
  schemeId: string,
) {
  const scheme = await CodeScheme.findOne({
    _id: new Types.ObjectId(schemeId),
    organizationId: toObjectId(organizationId),
  }).lean();

  if (!scheme) {
    throw AppError.notFound("Esquema de código no encontrado");
  }

  return scheme;
}

/* ---------- Create ---------- */

async function createScheme(
  organizationId: string | Types.ObjectId,
  data: CodeSchemeInput,
) {
  // Validate pattern
  const validation = validatePattern(data.pattern);
  if (!validation.valid) {
    throw AppError.badRequest(
      `Patrón de código inválido: ${validation.errors.join(", ")}`,
    );
  }

  const orgId = toObjectId(organizationId);

  // If this scheme should be default, unset existing default
  if (data.isDefault) {
    await CodeScheme.updateMany(
      { organizationId: orgId, entityType: data.entityType, isDefault: true },
      { $set: { isDefault: false } },
    );
  }

  const scheme = await CodeScheme.create({
    ...data,
    organizationId: orgId,
  });

  return scheme.toObject();
}

/* ---------- Update ---------- */

async function updateScheme(
  organizationId: string | Types.ObjectId,
  schemeId: string,
  data: CodeSchemeUpdateInput,
) {
  const orgId = toObjectId(organizationId);

  const scheme = await CodeScheme.findOne({
    _id: new Types.ObjectId(schemeId),
    organizationId: orgId,
  });

  if (!scheme) {
    throw AppError.notFound("Esquema de código no encontrado");
  }

  // Validate pattern if being changed
  if (data.pattern) {
    const validation = validatePattern(data.pattern);
    if (!validation.valid) {
      throw AppError.badRequest(
        `Patrón de código inválido: ${validation.errors.join(", ")}`,
      );
    }
  }

  Object.assign(scheme, data);
  await scheme.save();

  return scheme.toObject();
}

/* ---------- Delete ---------- */

async function deleteScheme(
  organizationId: string | Types.ObjectId,
  schemeId: string,
) {
  const orgId = toObjectId(organizationId);
  const id = new Types.ObjectId(schemeId);

  const scheme = await CodeScheme.findOne({ _id: id, organizationId: orgId });
  if (!scheme) {
    throw AppError.notFound("Esquema de código no encontrado");
  }

  if (scheme.isDefault) {
    throw AppError.badRequest(
      "No se puede eliminar el esquema predeterminado. Establezca otro esquema como predeterminado primero.",
    );
  }

  await CodeScheme.deleteOne({ _id: id });
  return { deleted: true };
}

/* ---------- Set as Default ---------- */

async function setAsDefault(
  organizationId: string | Types.ObjectId,
  schemeId: string,
) {
  const orgId = toObjectId(organizationId);
  const id = new Types.ObjectId(schemeId);

  const scheme = await CodeScheme.findOne({ _id: id, organizationId: orgId });
  if (!scheme) {
    throw AppError.notFound("Esquema de código no encontrado");
  }

  if (!scheme.isActive) {
    throw AppError.badRequest(
      "No se puede establecer un esquema inactivo como predeterminado",
    );
  }

  // Unset existing default for same entityType
  await CodeScheme.updateMany(
    { organizationId: orgId, entityType: scheme.entityType, isDefault: true },
    { $set: { isDefault: false } },
  );

  scheme.isDefault = true;
  await scheme.save();

  return scheme.toObject();
}

/* ---------- Seed Defaults ---------- */

/**
 * Idempotently seeds default code schemes for a new organization.
 * Uses findOneAndUpdate + $setOnInsert + upsert to avoid duplicates.
 */
async function seedDefaultSchemes(
  organizationId: Types.ObjectId,
  session?: ClientSession,
) {
  const defaults: {
    entityType: EntityType;
    name: string;
    pattern: string;
  }[] = [
    {
      entityType: "loan",
      name: "Predeterminado Préstamo",
      pattern: "LO-{YYYY}-{SEQ:4}",
    },
    {
      entityType: "loan_request",
      name: "Predeterminado Solicitud",
      pattern: "REQ-{YYYY}-{SEQ:4}",
    },
  ];

  for (const def of defaults) {
    await CodeScheme.findOneAndUpdate(
      {
        organizationId,
        entityType: def.entityType,
        name: def.name,
      },
      {
        $setOnInsert: {
          organizationId,
          entityType: def.entityType,
          name: def.name,
          pattern: def.pattern,
          isActive: true,
          isDefault: true,
        },
      },
      {
        upsert: true,
        ...(session ? { session } : {}),
      },
    );
  }
}

/* ---------- Export ---------- */

export const codeSchemeService = {
  listSchemes,
  getSchemeById,
  createScheme,
  updateScheme,
  deleteScheme,
  setAsDefault,
  seedDefaultSchemes,
};
