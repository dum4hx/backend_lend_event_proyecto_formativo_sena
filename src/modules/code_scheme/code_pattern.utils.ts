/**
 * Pattern parsing, validation, scope-key building, and resolution
 * for the custom code generation system.
 *
 * Supported tokens:
 *   {SEQ}            — unpadded sequential number
 *   {SEQ:N}          — zero-padded to N digits
 *   {YYYY}           — 4-digit year
 *   {YY}             — 2-digit year
 *   {MM}             — 2-digit month (01-12)
 *   {DD}             — 2-digit day (01-31)
 *   {LOCATION_CODE}  — location code (uppercase alphanumeric)
 */

/* ---------- Types ---------- */

export interface TokenLiteral {
  kind: "literal";
  value: string;
}

export interface TokenVariable {
  kind: "variable";
  name: string;
  padding?: number; // only for SEQ
}

export type Token = TokenLiteral | TokenVariable;

export interface CodeGenContext {
  locationCode?: string;
  categoryCode?: string;
  typeCode?: string;
  date?: Date;
}

export interface TokenValues {
  seq: number;
  year?: string;
  yearShort?: string;
  month?: string;
  day?: string;
  locationCode?: string;
  categoryCode?: string;
  typeCode?: string;
}

/* ---------- Constants ---------- */

const KNOWN_TOKENS = new Set([
  "SEQ",
  "YYYY",
  "YY",
  "MM",
  "DD",
  "LOCATION_CODE",
  "CATEGORY_CODE",
  "TYPE_CODE",
]);

// Matches {TOKEN} or {SEQ:N}
const TOKEN_REGEX = /\{([A-Z_]+(?::\d+)?)\}/g;

/* ---------- Parse ---------- */

export function parseTokens(pattern: string): Token[] {
  const tokens: Token[] = [];
  let lastIdx = 0;

  for (const match of pattern.matchAll(TOKEN_REGEX)) {
    const matchIdx = match.index!;

    // Literal text before this token
    if (matchIdx > lastIdx) {
      tokens.push({ kind: "literal", value: pattern.slice(lastIdx, matchIdx) });
    }

    const raw = match[1]!; // e.g. "SEQ:4" or "YYYY"

    if (raw.startsWith("SEQ")) {
      const parts = raw.split(":");
      const padding = parts.length === 2 ? parseInt(parts[1]!, 10) : undefined;
      tokens.push({
        kind: "variable",
        name: "SEQ",
        ...(padding != null ? { padding } : {}),
      });
    } else {
      tokens.push({ kind: "variable", name: raw });
    }

    lastIdx = matchIdx + match[0].length;
  }

  // Trailing literal
  if (lastIdx < pattern.length) {
    tokens.push({ kind: "literal", value: pattern.slice(lastIdx) });
  }

  return tokens;
}

/* ---------- Validate ---------- */

export function validatePattern(pattern: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (pattern.length > 50) {
    errors.push("El patrón no puede exceder 50 caracteres");
  }

  const tokens = parseTokens(pattern);
  const variableTokens = tokens.filter(
    (t): t is TokenVariable => t.kind === "variable",
  );

  // Must contain exactly one SEQ token
  const seqTokens = variableTokens.filter((t) => t.name === "SEQ");
  if (seqTokens.length === 0) {
    errors.push("El patrón debe contener al menos un token {SEQ} o {SEQ:N}");
  } else if (seqTokens.length > 1) {
    errors.push("El patrón no puede contener más de un token {SEQ} o {SEQ:N}");
  }

  // Validate SEQ padding
  for (const tok of seqTokens) {
    if (tok.padding !== undefined && (tok.padding < 1 || tok.padding > 10)) {
      errors.push(
        "El padding del secuencial debe estar entre 1 y 10 (ej. {SEQ:4})",
      );
    }
  }

  // Check for unknown tokens
  for (const tok of variableTokens) {
    if (!KNOWN_TOKENS.has(tok.name)) {
      errors.push(`Token desconocido: {${tok.name}}`);
    }
  }

  // Check for raw braces that were not matched (malformed tokens)
  const cleaned = pattern.replace(TOKEN_REGEX, "");
  if (cleaned.includes("{") || cleaned.includes("}")) {
    errors.push("El patrón contiene llaves sin cerrar o tokens mal formados");
  }

  return { valid: errors.length === 0, errors };
}

/* ---------- Scope Key ---------- */

/**
 * Derives the counter scope key from the pattern and context.
 * The scope determines when the counter resets.
 *
 * Examples:
 *  - Pattern with {YYYY}           → "2026"
 *  - Pattern with {YYYY}{MM}       → "2026-04"
 *  - Pattern with {YYYY}{MM}{DD}   → "2026-04-06"
 *  - Pattern with {LOCATION_CODE}  → appends ":LOC_ABC"
 *  - No date/location tokens       → "global"
 */
export function buildScopeKey(
  pattern: string,
  context: CodeGenContext,
): string {
  const tokens = parseTokens(pattern);
  const varNames = new Set(
    tokens
      .filter((t): t is TokenVariable => t.kind === "variable")
      .map((t) => t.name),
  );

  const date = context.date ?? new Date();
  const parts: string[] = [];

  // Date-based scope
  const hasYear = varNames.has("YYYY") || varNames.has("YY");
  const hasMonth = varNames.has("MM");
  const hasDay = varNames.has("DD");

  if (hasYear) {
    parts.push(String(date.getFullYear()));
    if (hasMonth) {
      parts.push(String(date.getMonth() + 1).padStart(2, "0"));
      if (hasDay) {
        parts.push(String(date.getDate()).padStart(2, "0"));
      }
    }
  }

  let scopeKey = parts.length > 0 ? parts.join("-") : "global";

  // Location scope
  if (varNames.has("LOCATION_CODE") && context.locationCode) {
    scopeKey += `:${context.locationCode}`;
  }

  // Type code scope
  if (varNames.has("TYPE_CODE") && context.typeCode) {
    scopeKey += `:TYPE_${context.typeCode}`;
  }

  // Category code scope
  if (varNames.has("CATEGORY_CODE") && context.categoryCode) {
    scopeKey += `:CAT_${context.categoryCode}`;
  }

  return scopeKey;
}

/* ---------- Resolve ---------- */

/**
 * Replace all tokens in the pattern with their resolved values.
 */
export function resolvePattern(pattern: string, values: TokenValues): string {
  return pattern.replace(TOKEN_REGEX, (fullMatch, rawToken: string) => {
    if (rawToken.startsWith("SEQ")) {
      const parts = rawToken.split(":");
      const padding = parts.length === 2 ? parseInt(parts[1]!, 10) : 0;
      return padding > 0
        ? String(values.seq).padStart(padding, "0")
        : String(values.seq);
    }

    switch (rawToken) {
      case "YYYY":
        return values.year ?? "";
      case "YY":
        return values.yearShort ?? "";
      case "MM":
        return values.month ?? "";
      case "DD":
        return values.day ?? "";
      case "LOCATION_CODE":
        return values.locationCode ?? "";
      case "CATEGORY_CODE":
        return values.categoryCode ?? "";
      case "TYPE_CODE":
        return values.typeCode ?? "";
      default:
        return fullMatch;
    }
  });
}

/**
 * Build TokenValues from context date and location.
 */
export function buildTokenValues(
  seq: number,
  context: CodeGenContext,
): TokenValues {
  const date = context.date ?? new Date();
  const year = String(date.getFullYear());

  return {
    seq,
    year,
    yearShort: year.slice(-2),
    month: String(date.getMonth() + 1).padStart(2, "0"),
    day: String(date.getDate()).padStart(2, "0"),
    ...(context.locationCode != null
      ? { locationCode: context.locationCode }
      : {}),
    ...(context.categoryCode != null
      ? { categoryCode: context.categoryCode }
      : {}),
    ...(context.typeCode != null
      ? { typeCode: context.typeCode }
      : {}),
  };
}
