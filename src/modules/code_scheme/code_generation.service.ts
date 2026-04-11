import { Types, type ClientSession } from "mongoose";
import { CodeScheme, type EntityType } from "./models/code_scheme.model.ts";
import { CodeCounter } from "./models/code_counter.model.ts";
import { Location } from "../location/models/location.model.ts";
import { MaterialModel } from "../material/models/material_type.model.ts";
import { Category } from "../material/models/category.model.ts";
import { AppError } from "../../errors/AppError.ts";
import {
  validatePattern,
  buildScopeKey,
  resolvePattern,
  buildTokenValues,
  type CodeGenContext,
} from "./code_pattern.utils.ts";

/* ---------- Fallback Patterns ---------- */

const FALLBACK_PATTERNS: Record<EntityType, string> = {
  loan: "LN-{SEQ:4}",
  invoice: "INV-{YYYY}-{SEQ:4}",
  inspection: "INSP-{YYYY}-{SEQ:4}",
  incident: "INC-{YYYY}-{SEQ:4}",
  maintenance_batch: "MNT-{YYYY}-{SEQ:4}",
  material_instance: "MI-{SEQ:6}",
};

// Deterministic ObjectIds used as schemeId for fallback counters
const FALLBACK_SCHEME_IDS: Record<EntityType, Types.ObjectId> = {
  loan: new Types.ObjectId("000000000000000000000001"),
  invoice: new Types.ObjectId("000000000000000000000003"),
  inspection: new Types.ObjectId("000000000000000000000004"),
  incident: new Types.ObjectId("000000000000000000000005"),
  maintenance_batch: new Types.ObjectId("000000000000000000000006"),
  material_instance: new Types.ObjectId("000000000000000000000007"),
};

/* ---------- Service ---------- */

export interface GenerateCodeOptions {
  organizationId: string | Types.ObjectId;
  entityType: EntityType;
  context?: {
    locationId?: string | Types.ObjectId;
    materialTypeId?: string | Types.ObjectId;
    categoryId?: string | Types.ObjectId;
  };
  session?: ClientSession;
}

/* ---------- Helpers ---------- */

function toObjectId(id: string | Types.ObjectId): Types.ObjectId {
  return typeof id === "string" ? new Types.ObjectId(id) : id;
}

/**
 * Find the most specific code scheme for a material instance.
 * Resolution: Type-scoped → Category-scoped → Global → null (use fallback).
 */
async function findMaterialInstanceScheme(
  orgId: Types.ObjectId,
  materialTypeId: Types.ObjectId | undefined,
  session?: ClientSession,
) {
  const sessionOpts = session ? { session } : undefined;

  // 1. Type-scoped scheme
  if (materialTypeId) {
    const typeScheme = await CodeScheme.findOne(
      {
        organizationId: orgId,
        entityType: "material_instance",
        materialTypeId,
        isDefault: true,
        isActive: true,
      },
      null,
      sessionOpts,
    );
    if (typeScheme) return typeScheme;
  }

  // 2. Category-scoped scheme (from the material type's categories)
  if (materialTypeId) {
    const mt = await MaterialModel.findById(
      materialTypeId,
      { categoryId: 1 },
      sessionOpts,
    );
    if (mt?.categoryId?.length) {
      const catScheme = await CodeScheme.findOne(
        {
          organizationId: orgId,
          entityType: "material_instance",
          categoryId: { $in: mt.categoryId },
          materialTypeId: null,
          isDefault: true,
          isActive: true,
        },
        null,
        sessionOpts,
      );
      if (catScheme) return catScheme;
    }
  }

  // 3. Global scheme (no scope)
  const globalScheme = await CodeScheme.findOne(
    {
      organizationId: orgId,
      entityType: "material_instance",
      materialTypeId: null,
      categoryId: null,
      isDefault: true,
      isActive: true,
    },
    null,
    sessionOpts,
  );

  return globalScheme;
}

/* ---------- Code Generation ---------- */

/**
 * Generate a unique code for an entity.
 *
 * 1. Finds the default active scheme (scope resolution for material_instance).
 * 2. Resolves context tokens ({LOCATION_CODE}, {TYPE_CODE}, {CATEGORY_CODE}).
 * 3. Atomically increments the scoped counter.
 * 4. Resolves the pattern and returns the code string.
 */
async function generateCode(opts: GenerateCodeOptions): Promise<string> {
  const { organizationId, entityType, context, session } = opts;
  const orgId = toObjectId(organizationId);

  // 1. Find scheme (scope resolution for material_instance)
  let scheme;
  if (entityType === "material_instance") {
    const mtId = context?.materialTypeId
      ? toObjectId(context.materialTypeId)
      : undefined;
    scheme = await findMaterialInstanceScheme(orgId, mtId, session);
  } else {
    scheme = await CodeScheme.findOne(
      {
        organizationId: orgId,
        entityType,
        isDefault: true,
        isActive: true,
      },
      null,
      session ? { session } : undefined,
    );
  }

  const pattern = scheme?.pattern ?? FALLBACK_PATTERNS[entityType];
  const schemeId = scheme?._id ?? FALLBACK_SCHEME_IDS[entityType];

  // 2. Validate pattern
  const validation = validatePattern(pattern);
  if (!validation.valid) {
    throw AppError.internal(
      `Patrón de código inválido para ${entityType}: ${validation.errors.join(", ")}`,
    );
  }

  // 3. Resolve context tokens
  const genContext: CodeGenContext = { date: new Date() };

  // 3a. Location code
  if (pattern.includes("{LOCATION_CODE}")) {
    if (!context?.locationId) {
      throw AppError.badRequest(
        "El patrón de código requiere una ubicación, pero no se proporcionó locationId",
      );
    }

    const location = await Location.findById(
      context.locationId,
      { code: 1 },
      session ? { session } : undefined,
    );

    if (!location) {
      throw AppError.notFound(
        "Ubicación no encontrada para resolver el código",
      );
    }

    if (!location.code) {
      throw AppError.badRequest(
        "La ubicación no tiene un código asignado, requerido por el patrón de código",
      );
    }

    genContext.locationCode = location.code;
  }

  // 3b. Type code
  if (pattern.includes("{TYPE_CODE}")) {
    if (!context?.materialTypeId) {
      throw AppError.badRequest(
        "El patrón de código requiere un tipo de material, pero no se proporcionó materialTypeId",
      );
    }

    const mt = await MaterialModel.findById(
      context.materialTypeId,
      { code: 1 },
      session ? { session } : undefined,
    );

    if (!mt) {
      throw AppError.notFound(
        "Tipo de material no encontrado para resolver el código",
      );
    }

    if (!mt.code) {
      throw AppError.badRequest(
        "El tipo de material no tiene un código asignado, requerido por el patrón de código",
      );
    }

    genContext.typeCode = mt.code;
  }

  // 3c. Category code
  if (pattern.includes("{CATEGORY_CODE}")) {
    let categoryId: string | Types.ObjectId | undefined = context?.categoryId;

    // Resolve from scheme scope if not provided
    if (!categoryId && scheme?.categoryId) {
      categoryId = scheme.categoryId;
    }

    // Resolve from material type's first category
    if (!categoryId && context?.materialTypeId) {
      const mt = await MaterialModel.findById(
        context.materialTypeId,
        { categoryId: 1 },
        session ? { session } : undefined,
      );
      if (mt?.categoryId?.length) {
        categoryId = mt.categoryId[0]!;
      }
    }

    if (!categoryId) {
      throw AppError.badRequest(
        "El patrón de código requiere una categoría, pero no se pudo resolver categoryId",
      );
    }

    const cat = await Category.findById(
      categoryId,
      { code: 1 },
      session ? { session } : undefined,
    );

    if (!cat) {
      throw AppError.notFound(
        "Categoría no encontrada para resolver el código",
      );
    }

    if (!cat.code) {
      throw AppError.badRequest(
        "La categoría no tiene un código asignado, requerido por el patrón de código",
      );
    }

    genContext.categoryCode = cat.code;
  }

  // 4. Build scope key
  const scopeKey = buildScopeKey(pattern, genContext);

  // 5. Atomic increment
  const counter = await CodeCounter.findOneAndUpdate(
    {
      organizationId: orgId,
      schemeId,
      scopeKey,
    },
    { $inc: { currentValue: 1 } },
    {
      upsert: true,
      new: true,
      ...(session ? { session } : {}),
    },
  );

  // 6. Resolve pattern
  const tokenValues = buildTokenValues(counter.currentValue, genContext);
  const code = resolvePattern(pattern, tokenValues);

  return code;
}

export const codeGenerationService = {
  generateCode,
};
