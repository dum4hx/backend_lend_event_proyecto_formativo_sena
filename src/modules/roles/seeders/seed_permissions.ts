/**
 * scripts/seed-permissions.ts
 *
 * Seeds permissions into the Permission collection.
 *
 * TODO: fill the import placeholders below to match your project paths/exports.
 */

/// PLACEHOLDERS - replace these with your actual project imports
// import mongoose from "mongoose";
import mongoose from "mongoose"; // <-- keep or replace if you use a custom DB util
// import { Permission, PermissionZodSchema, type PermissionInput } from "../models/permissions.model";
import {
  Permission,
  PermissionZodSchema,
  type PermissionInput,
} from "../models/permissions.model.ts";
// import * as RoleModelExports from "../models/role.model"; // <-- we'll try to be flexible when locating definitions
import * as RoleModelExports from "../models/role.model.ts";
import { connectDB } from "../../../utils/db/connectDB.ts";

/// CONFIG
const MONGODB_URI =
  process.env.DB_CONNECTION_STRING ?? "mongodb://localhost:27017/your-db-name";
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

/**
 * Helper: normalize a permission source entry into canonical PermissionInput shape.
 *
 * Accepts several input shapes commonly used across projects:
 * - string: "resource:action"
 * - object with `_id` and other fields
 * - object keyed map like { USERS_CREATE: "users:create", ... }
 *
 * If displayName/description/category missing, the function will make reasonable inferences.
 */
function normalizePermissionEntry(entry: any): PermissionInput | null {
  // If it's a plain string, treat as the permission id
  if (typeof entry === "string") {
    const _id = entry;
    return {
      _id,
      displayName: inferDisplayNameFromId(_id),
      description: `${inferDisplayNameFromId(_id)} (auto-generated)`,
      category: inferCategoryFromId(_id),
      isActive: true,
    } as PermissionInput;
  }

  // If it's an object with _id or id
  if (entry && typeof entry === "object") {
    // object might be { key: "users:create" } if called from Object.entries map
    if (!entry._id && entry.id && typeof entry.id === "string") {
      entry._id = entry.id;
    }

    if (!entry._id) {
      // Might be a map item like ['USERS_CREATE', 'users:create'] - skip here (handled by outer logic)
      return null;
    }

    const partial = {
      _id: String(entry._id),
      displayName:
        entry.displayName ??
        entry.name ??
        (typeof entry._id === "string"
          ? inferDisplayNameFromId(String(entry._id))
          : "Unknown"),
      description: entry.description ?? "",
      category: entry.category ?? inferCategoryFromId(String(entry._id)),
      isActive: typeof entry.isActive === "boolean" ? entry.isActive : true,
    };

    return partial as PermissionInput;
  }

  return null;
}

/** Infer a readable display name from an id like "users:create" -> "Create users" */
function inferDisplayNameFromId(id: string) {
  const [resource, action] = id.split(":");
  if (!resource || !action) return id;
  // make each word capitalized
  const rc = resource.split("_").map(cap).join(" ");
  const ac = action.split("_").map(cap).join(" ");
  // prefer "Action Resource" (Create Users), but if it sounds better "Manage Inventory" keep this pattern.
  return `${cap(ac)} ${rc}`;
}

/** Infer a category from the resource part (before colon), fallback to "Misc" */
function inferCategoryFromId(id: string) {
  const resource = String(id).split(":")[0] ?? "";
  if (!resource) return "Misc";
  // attempt to map common resources to categories used in your permissions.model.ts (example)
  const map: Record<string, string> = {
    organization: "Organization",
    user: "Users",
    users: "Users",
    billing: "Billing",
    material: "Materials",
    materials: "Materials",
    package: "Packages",
    packages: "Packages",
    request: "Requests",
    requests: "Requests",
    loan: "Loans",
    loans: "Loans",
    inspection: "Inspections",
    inspections: "Inspections",
    invoice: "Invoices",
    invoices: "Invoices",
    report: "Reports",
    reports: "Reports",
  };

  // prefer direct match or prefix match
  if (map[resource]) return map[resource];
  for (const k of Object.keys(map)) {
    if (resource.startsWith(k)) return map[k];
  }
  // fallback - capitalize
  return cap(resource);
}

function cap(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Attempt to extract a permission list from the role.model exports.
 * This is intentionally flexible because different projects export permissions in different shapes.
 *
 * Strategy:
 *  - Look for named exports that are arrays/objects/strings that look like permission identifiers.
 *  - Recognize arrays of strings or arrays of objects with _id fields.
 *  - Recognize objects whose values are permission strings (maps).
 */
function extractPermissionsFromRoleModelExports(
  exportsObj: Record<string, any>,
): any[] {
  const candidates: any[] = [];

  for (const [key, value] of Object.entries(exportsObj)) {
    // skip obvious non-permission exports (like types or functions)
    if (!value) continue;

    // arrays of strings like ['users:create', ...]
    if (Array.isArray(value) && value.length > 0) {
      if (
        typeof value[0] === "string" &&
        /^[a-z_]+:[a-z_]+$/.test(String(value[0]))
      ) {
        candidates.push(...value);
        continue;
      }
      // array of objects with _id or id
      if (
        typeof value[0] === "object" &&
        (value[0]._id || value[0].id || value[0].displayName)
      ) {
        candidates.push(...value);
        continue;
      }
    }

    // object map: { USERS_CREATE: 'users:create', ... } or { users: { create: 'users:create' } }
    if (typeof value === "object" && !Array.isArray(value)) {
      // flatten values that look like permission strings
      const vals = Object.values(value).flat(Infinity);
      for (const v of vals) {
        if (typeof v === "string" && /^[a-z_]+:[a-z_]+$/.test(v)) {
          candidates.push(v);
        } else if (
          typeof v === "object" &&
          v !== null &&
          ("_id" in v || "id" in v)
        ) {
          candidates.push(v);
        }
      }
    }
  }

  // dedupe while preserving order
  const seen = new Set<string>();
  const deduped: any[] = [];
  for (const c of candidates) {
    const id = typeof c === "string" ? c : (c._id ?? c.id ?? JSON.stringify(c));
    if (!seen.has(id)) {
      seen.add(id);
      deduped.push(c);
    }
  }

  return deduped;
}

/** Upsert a single permission */
async function upsertPermission(p: PermissionInput) {
  const { _id, displayName, description, category, isActive } = p;
  if (DRY_RUN) {
    console.log("[DRY RUN] upsert:", p);
    return;
  }

  await Permission.updateOne(
    { _id },
    {
      $set: {
        displayName,
        description,
        category,
        isActive: Boolean(isActive),
      },
    },
    { upsert: true },
  );
}

/** Main seed runner */
async function run() {
  console.log("Connecting to MongoDB at", MONGODB_URI);
  await connectDB();

  try {
    // 1) extract candidate permissions from role.model's exports
    const rawCandidates =
      extractPermissionsFromRoleModelExports(RoleModelExports);
    if (rawCandidates.length === 0) {
      console.warn(
        "No permissions found in role.model exports. Make sure to export a permissions list from role.model.ts, e.g. `export const PERMISSIONS = [...]`.\n" +
          "Current role.model exports keys: " +
          Object.keys(RoleModelExports).join(", "),
      );
      process.exitCode = 2;
      return;
    }

    // 2) normalize and validate
    const normalized: PermissionInput[] = [];
    for (const item of rawCandidates) {
      // If item is an array entry of [KEY, value] (from Object.entries), handle it externally - already flattened above
      const n = normalizePermissionEntry(item);
      if (!n) {
        console.warn("Skipping unknown permission entry shape:", item);
        continue;
      }

      // Validate with zod schema before upsert
      try {
        // PermissionZodSchema will throw on invalid
        const validated = PermissionZodSchema.parse(n);
        normalized.push(validated);
      } catch (err) {
        console.error("Validation failed for permission:", n, "\nError:", err);
      }
    }

    console.log(`Found ${normalized.length} valid permission(s).`);

    // 3) Upsert all permissions
    for (const p of normalized) {
      console.log("Seeding permission:", p._id);
      await upsertPermission(p);
    }

    console.log("Permissions seeding complete.");
  } finally {
    if (!DRY_RUN) {
      await mongoose.disconnect();
    }
  }
}

/** Export functions for programmatic use (tests, other scripts) */
export {
  run,
  extractPermissionsFromRoleModelExports,
  normalizePermissionEntry,
};

run();
