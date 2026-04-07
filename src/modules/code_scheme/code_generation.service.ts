import { Types, type ClientSession } from "mongoose";
import { CodeScheme, type EntityType } from "./models/code_scheme.model.ts";
import { CodeCounter } from "./models/code_counter.model.ts";
import { Location } from "../location/models/location.model.ts";
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
  loan_request: "REQ-{SEQ:4}",
};

// Deterministic ObjectIds used as schemeId for fallback counters
const FALLBACK_SCHEME_IDS: Record<EntityType, Types.ObjectId> = {
  loan: new Types.ObjectId("000000000000000000000001"),
  loan_request: new Types.ObjectId("000000000000000000000002"),
};

/* ---------- Service ---------- */

export interface GenerateCodeOptions {
  organizationId: string | Types.ObjectId;
  entityType: EntityType;
  context?: { locationId?: string | Types.ObjectId };
  session?: ClientSession;
}

/**
 * Generate a unique code for a Loan or LoanRequest.
 *
 * 1. Finds the default active scheme (or falls back to a hardcoded pattern).
 * 2. Resolves {LOCATION_CODE} if present.
 * 3. Atomically increments the scoped counter.
 * 4. Resolves the pattern and returns the code string.
 */
async function generateCode(opts: GenerateCodeOptions): Promise<string> {
  const { organizationId, entityType, context, session } = opts;
  const orgId =
    typeof organizationId === "string"
      ? new Types.ObjectId(organizationId)
      : organizationId;

  // 1. Find default scheme
  const scheme = await CodeScheme.findOne(
    {
      organizationId: orgId,
      entityType,
      isDefault: true,
      isActive: true,
    },
    null,
    session ? { session } : undefined,
  );

  const pattern = scheme?.pattern ?? FALLBACK_PATTERNS[entityType];
  const schemeId = scheme?._id ?? FALLBACK_SCHEME_IDS[entityType];

  // 2. Validate pattern (should always be valid if created via CRUD, but guard)
  const validation = validatePattern(pattern);
  if (!validation.valid) {
    throw AppError.internal(
      `Patrón de código inválido para ${entityType}: ${validation.errors.join(", ")}`,
    );
  }

  // 3. Resolve location code if needed
  const genContext: CodeGenContext = { date: new Date() };

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
