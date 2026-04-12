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

  // TYPE_CODE / CATEGORY_CODE tokens only allowed for material_instance
  if (data.entityType !== "material_instance") {
    if (
      data.pattern.includes("{TYPE_CODE}") ||
      data.pattern.includes("{CATEGORY_CODE}")
    ) {
      throw AppError.badRequest(
        "Los tokens {TYPE_CODE} y {CATEGORY_CODE} solo están permitidos para el tipo de entidad material_instance",
      );
    }
  }

  const orgId = toObjectId(organizationId);

  // If this scheme should be default, unset existing default in same scope
  if (data.isDefault) {
    const defaultFilter: Record<string, unknown> = {
      organizationId: orgId,
      entityType: data.entityType,
      isDefault: true,
    };
    if (data.entityType === "material_instance") {
      defaultFilter.materialTypeId = data.materialTypeId ?? null;
      defaultFilter.categoryId = data.categoryId ?? null;
    }
    await CodeScheme.updateMany(defaultFilter, { $set: { isDefault: false } });
  }

  const { materialTypeId, categoryId, ...rest } = data;
  const scheme = await CodeScheme.create({
    ...rest,
    ...(materialTypeId != null ? { materialTypeId } : {}),
    ...(categoryId != null ? { categoryId } : {}),
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

    // TYPE_CODE / CATEGORY_CODE tokens only allowed for material_instance
    if (scheme.entityType !== "material_instance") {
      if (
        data.pattern.includes("{TYPE_CODE}") ||
        data.pattern.includes("{CATEGORY_CODE}")
      ) {
        throw AppError.badRequest(
          "Los tokens {TYPE_CODE} y {CATEGORY_CODE} solo están permitidos para el tipo de entidad material_instance",
        );
      }
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

  // Unset existing default for same entityType + scope
  const defaultFilter: Record<string, unknown> = {
    organizationId: orgId,
    entityType: scheme.entityType,
    isDefault: true,
  };
  if (scheme.entityType === "material_instance") {
    defaultFilter.materialTypeId = scheme.materialTypeId ?? null;
    defaultFilter.categoryId = scheme.categoryId ?? null;
  }
  await CodeScheme.updateMany(defaultFilter, { $set: { isDefault: false } });

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
      entityType: "invoice",
      name: "Predeterminado Factura",
      pattern: "INV-{YYYY}-{SEQ:4}",
    },
    {
      entityType: "inspection",
      name: "Predeterminado Inspección",
      pattern: "INSP-{YYYY}-{SEQ:4}",
    },
    {
      entityType: "incident",
      name: "Predeterminado Incidente",
      pattern: "INC-{YYYY}-{SEQ:4}",
    },
    {
      entityType: "maintenance_batch",
      name: "Predeterminado Mantenimiento",
      pattern: "MNT-{YYYY}-{SEQ:4}",
    },
    {
      entityType: "material_instance",
      name: "Predeterminado Instancia Material",
      pattern: "MI-{SEQ:6}",
    },
    {
      entityType: "ticket",
      name: "Predeterminado Ticket",
      pattern: "TKT-{YYYY}-{SEQ:4}",
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
