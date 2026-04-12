import { z } from "zod";
import { createRequire } from "node:module";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

/* ---------- User Roles (RBAC) ---------- */

export const userRoleOptions = [
  "super_admin", // Software owner
  "owner",
  "manager",
  "warehouse_operator",
  "commercial_advisor",
] as const;

export type UserRole = (typeof userRoleOptions)[number];

/**
 * Organization-level roles — excludes `super_admin` which is a
 * platform-only role and must never be assignable inside an organization.
 */
export const organizationRoleOptions = [
  "owner",
  "manager",
  "warehouse_operator",
  "commercial_advisor",
] as const;

export type DefaultOrganizationRole = (typeof organizationRoleOptions)[number];

// Super admin only permissions (for platform management)
export const super_admin_only_permsissions = [
  "subscription_types:create",
  "subscription_types:read",
  "subscription_types:update",
  "subscription_types:delete",
  "platform:manage",
  "permissions:create",
  "permissions:update",
  "permissions:delete",
] as const;

// Role permissions map
export const rolePermissions: Record<UserRole, string[]> = {
  super_admin: [
    // Super admin has full platform access
    ...super_admin_only_permsissions,
    // Also includes all owner permissions
    "organization:read",
    "organization:update",
    "organization:delete",
    "billing:manage",
    "subscription:manage",
    "users:create",
    "users:read",
    "users:update",
    "users:delete",
    "customers:create",
    "customers:read",
    "customers:update",
    "customers:delete",
    "material_types:create",
    "categories:create",
    "material_instances:create",
    "materials:read",
    "materials:update",
    "materials:delete",
    "materials:state:update",
    "material_attributes:create",
    "material_attributes:read",
    "material_attributes:update",
    "material_attributes:delete",
    "packages:create",
    "packages:read",
    "packages:update",
    "packages:delete",
    "requests:create",
    "requests:read",
    "requests:update",
    "requests:approve",
    "requests:cancel",
    "requests:delete",
    "requests:ready",
    "requests:assign",
    "loans:create",
    "loans:read",
    "loans:update",
    "loans:checkout",
    "loans:return",
    "inspections:create",
    "inspections:read",
    "inspections:update",
    "incidents:create",
    "incidents:read",
    "incidents:update",
    "incidents:acknowledge",
    "incidents:resolve",
    "incidents:dismiss",
    "invoices:create",
    "invoices:read",
    "invoices:update",
    "reports:read",
    // Role management
    "roles:create",
    "roles:read",
    "roles:update",
    "roles:delete",
    "permissions:read",
    "analytics:read",
    "transfers:create",
    "transfers:read",
    "transfers:update",
    "transfers:accept",
    "transfers:send",
    "transfers:receive",
    "transfer_rejection_reasons:manage",
    "pricing:read",
    "pricing:manage",
    "payment_methods:create",
    "payment_methods:read",
    "payment_methods:update",
    "payment_methods:delete",
    "operations:read",
    "maintenance:read",
    "maintenance:create",
    "maintenance:update",
    "maintenance:resolve",
    "maintenance:delete",
    "tickets:read",
    "tickets:create",
    "tickets:review",
    "tickets:approve",
    "tickets:reject",
    "tickets:cancel",
  ],
  owner: [
    // Full organization access except platform management
    "organization:read",
    "organization:update",
    "organization:delete",
    "billing:manage",
    "subscription:manage",
    "users:create",
    "users:read",
    "users:update",
    "users:delete",
    "customers:create",
    "customers:read",
    "customers:update",
    "customers:delete",
    "material_types:create",
    "categories:create",
    "material_instances:create",
    "materials:read",
    "materials:update",
    "materials:delete",
    "locations:create",
    "locations:read",
    "locations:update",
    "locations:delete",
    "materials:state:update",
    "material_attributes:create",
    "material_attributes:read",
    "material_attributes:update",
    "material_attributes:delete",
    "packages:create",
    "packages:read",
    "packages:update",
    "packages:delete",
    "requests:create",
    "requests:read",
    "requests:update",
    "requests:approve",
    "requests:cancel",
    "requests:delete",
    "requests:assign",
    "requests:ready",
    "loans:create",
    "loans:read",
    "loans:update",
    "loans:checkout",
    "loans:return",
    "inspections:create",
    "inspections:read",
    "inspections:update",
    "incidents:create",
    "incidents:read",
    "incidents:update",
    "incidents:acknowledge",
    "incidents:resolve",
    "incidents:dismiss",
    "invoices:create",
    "invoices:read",
    "invoices:update",
    "invoices:delete",
    "reports:read",
    // Role management
    "roles:create",
    "roles:read",
    "roles:update",
    "roles:delete",
    "permissions:read",
    "analytics:read",
    "transfers:create",
    "transfers:read",
    "transfers:update",
    "transfers:accept",
    "transfers:send",
    "transfers:receive",
    "transfer_rejection_reasons:manage",
    "pricing:read",
    "pricing:manage",
    "payment_methods:create",
    "payment_methods:read",
    "payment_methods:update",
    "payment_methods:delete",
    "operations:read",
    "maintenance:read",
    "maintenance:create",
    "maintenance:update",
    "maintenance:resolve",
    "maintenance:delete",
    "code_schemes:read",
    "code_schemes:create",
    "code_schemes:update",
    "code_schemes:delete",
    "tickets:read",
    "tickets:create",
    "tickets:review",
    "tickets:approve",
    "tickets:reject",
    "tickets:cancel",
  ],
  manager: [
    "organization:read",
    "customers:read",
    "users:read",
    "material_types:create",
    "categories:create",
    "material_instances:create",
    "materials:read",
    "materials:update",
    "materials:delete",
    "material_attributes:create",
    "material_attributes:read",
    "material_attributes:update",
    "material_attributes:delete",
    "packages:create",
    "packages:read",
    "packages:update",
    "packages:delete",
    "requests:read",
    "loans:read",
    "inspections:read",
    "incidents:read",
    "incidents:resolve",
    "incidents:dismiss",
    "invoices:read",
    "reports:read",
    "analytics:read",
    "transfers:create",
    "transfers:read",
    "locations:read",
    "transfers:update",
    "transfers:accept",
    "transfer_rejection_reasons:manage",
    "pricing:read",
    "payment_methods:read",
    "payment_methods:create",
    "payment_methods:update",
    "operations:read",
    "maintenance:read",
    "maintenance:create",
    "maintenance:update",
    "maintenance:resolve",
    "maintenance:delete",
    "code_schemes:read",
    "code_schemes:create",
    "code_schemes:update",
    "code_schemes:delete",
    "tickets:read",
    "tickets:create",
    "tickets:review",
    "tickets:approve",
    "tickets:reject",
    "tickets:cancel",
  ],
  warehouse_operator: [
    "organization:read",
    "customers:read",
    "material_attributes:read",
    "materials:read",
    "material_instances:create",
    "materials:state:update",
    "packages:read",
    "requests:read",
    "requests:ready",
    "requests:assign",
    "loans:read",
    "loans:create",
    "loans:checkout",
    "locations:read",
    "inspections:create",
    "inspections:read",
    "inspections:update",
    "incidents:create",
    "incidents:read",
    "incidents:update",
    "incidents:acknowledge",
    "transfers:read",
    "transfers:send",
    "transfers:receive",
    "pricing:read",
    "payment_methods:read",
    "operations:read",
    "maintenance:read",
    "maintenance:update",
    "maintenance:resolve",
    "tickets:read",
    "tickets:create",
    "tickets:cancel",
  ],
  commercial_advisor: [
    "organization:read",
    "customers:create",
    "customers:read",
    "customers:update",
    "material_attributes:read",
    "materials:read",
    "packages:read",
    "requests:approve",
    "requests:cancel",
    "requests:create",
    "requests:read",
    "requests:update",
    "requests:cancel",
    "loans:read",
    "loans:update",
    "loans:return",
    "locations:read",
    "invoices:read",
    "pricing:read",
    "payment_methods:read",
    "tickets:read",
    "tickets:create",
    "tickets:cancel",
  ],
};

export const defaultOrganizationRoles: Record<
  DefaultOrganizationRole,
  string[]
> = {
  owner: rolePermissions.owner,
  manager: rolePermissions.manager,
  warehouse_operator: rolePermissions.warehouse_operator,
  commercial_advisor: rolePermissions.commercial_advisor,
} as const;

/**
 * String literal for the owner role name — use this constant instead of
 * the bare string `"owner"` to keep rename-refactors safe.
 */
export const OWNER_ROLE_NAME = "Propietario" as const;

/**
 * Full per-role definitions used when seeding a newly registered organization.
 *
 * Each entry extends the permission list with `isReadOnly` and `type` so the
 * auth service can persist correct metadata in a single pass.
 *
 * - `owner`  → `isReadOnly: true` / `type: "SYSTEM"`: non-editable covenant
 *   that an organization always has at least one super-role.  It is copied
 *   verbatim and assigned to the registering user.
 * - All other defaults → `isReadOnly: false` / `type: "CUSTOM"`: seeded for
 *   convenience but fully editable by the organization owner.
 */
export const defaultOrganizationRoleDefs: Array<{
  name: string;
  permissions: string[];
  isReadOnly: boolean;
  type: "SYSTEM" | "CUSTOM";
  description: string;
}> = [
  {
    name: "Propietario",
    permissions: rolePermissions.owner,
    isReadOnly: true,
    type: "SYSTEM",
    description:
      "Propietario de la organización — acceso completo. Rol del sistema, no editable y no eliminable.",
  },
  {
    name: "Gerente",
    permissions: rolePermissions.manager,
    isReadOnly: false,
    type: "CUSTOM",
    description:
      "Rol de gerente predeterminado — puede ser personalizado por el propietario.",
  },
  {
    name: "Operador de almacén",
    permissions: rolePermissions.warehouse_operator,
    isReadOnly: false,
    type: "CUSTOM",
    description:
      "Rol de operador de almacén predeterminado — puede ser personalizado por el propietario.",
  },
  {
    name: "Asesor comercial",
    permissions: rolePermissions.commercial_advisor,
    isReadOnly: false,
    type: "CUSTOM",
    description:
      "Rol de asesor comercial predeterminado — puede ser personalizado por el propietario.",
  },
];

/* ---------- Startup: validate default role permission dependencies ---------- */

const _require = createRequire(import.meta.url);
const _permissionsJson: Array<{ _id: string; requires?: string[] }> = _require(
  "../seeders/permissions.json",
);

const _PERMISSION_REQUIRES = new Map<string, string[]>(
  _permissionsJson
    .filter((p) => p.requires && p.requires.length > 0)
    .map((p) => [p._id, p.requires!]),
);

for (const roleDef of defaultOrganizationRoleDefs) {
  const permSet = new Set(roleDef.permissions);
  const issues: string[] = [];

  for (const perm of roleDef.permissions) {
    const deps = _PERMISSION_REQUIRES.get(perm);
    if (!deps) continue;
    const missing = deps.filter((d) => !permSet.has(d));
    if (missing.length > 0) {
      issues.push(`  - '${perm}' requiere: ${missing.join(", ")}`);
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `[role.model] El rol por defecto '${roleDef.name}' tiene dependencias de permisos incompletas:\n${issues.join("\n")}`,
    );
  }
}

/**
 * Flat, sorted, deduplicated list of every permission that can appear on an
 * organization role — i.e. the union of all org-scoped default roles.
 *
 * **Super-admin-only permissions are intentionally excluded** here because
 * they cannot be assigned to, or replicated within, an organization context.
 * Use this constant in the permissions endpoint so the client always receives
 * an up-to-date catalogue without having to know which permissions are
 * platform-only.
 */
export const organizationAvailablePermissions: readonly string[] = [
  ...new Set(organizationRoleOptions.flatMap((role) => rolePermissions[role])),
].sort();

// Types of roles enum
const roleTypes = ["SYSTEM", "CUSTOM"] as const;

// Zod schema for API validation
export const RoleZodSchema = z.object({
  name: z.string().min(3).max(50).trim(),
  permissions: z.array(z.string()).optional(),
  organizationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de organización no válido",
  }),
  description: z.string().max(500).trim().optional(),
  // Whether the role is read-only (system roles). Client may omit this; defaults handled by DB.
  isReadOnly: z.boolean().optional(),
  // Role type: SYSTEM or CUSTOM
  type: z.enum(roleTypes).optional(),
});

export type RoleInput = z.infer<typeof RoleZodSchema>;

// Mongoose schema
const roleSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: false, // Optional for system roles
      index: true,
    },
    // For system roles that shouldn't be modified/deleted
    isReadOnly: {
      type: Boolean,
      default: false,
      required: true,
    },
    name: {
      type: String,
      required: true,
      // NOTE: No `enum` restriction here — custom roles may use any name.
      // The `super_admin` name is blocked at the service layer via assertNotSuperAdmin.
      trim: true,
    },
    permissions: {
      type: [String],
      default: function (this: any) {
        return (rolePermissions as Record<string, string[]>)[this.name] ?? [];
      },
    },
    description: { type: String, maxlength: 500, trim: true },
    type: { type: String, enum: roleTypes, default: "CUSTOM" },
  },
  {
    timestamps: true,
  },
);

// Ensure a role name is unique within an organization
roleSchema.index({ organizationId: 1, name: 1 }, { unique: true });

export type RoleDocument = InferSchemaType<typeof roleSchema>;
export const Role = model<RoleDocument>("Role", roleSchema);
