import { z } from "zod";
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
    "materials:create",
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
    "requests:delete",
    "loans:create",
    "loans:read",
    "loans:update",
    "loans:checkout",
    "loans:return",
    "inspections:create",
    "inspections:read",
    "inspections:update",
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
    "pricing:read",
    "pricing:manage",
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
    "materials:create",
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
    "requests:delete",
    "requests:assign",
    "loans:create",
    "loans:read",
    "loans:update",
    "loans:checkout",
    "loans:return",
    "inspections:create",
    "inspections:read",
    "inspections:update",
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
    "pricing:read",
    "pricing:manage",
  ],
  manager: [
    "organization:read",
    "users:read",
    "customers:read",
    "materials:create",
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
    "requests:approve",
    "loans:read",
    "inspections:read",
    "invoices:read",
    "reports:read",
    "analytics:read",
    "transfers:create",
    "transfers:read",
    "transfers:update",
    "pricing:read",
    "pricing:manage",
  ],
  warehouse_operator: [
    "organization:read",
    "materials:read",
    "materials:state:update",
    "packages:read",
    "loans:read",
    "loans:checkout",
    "loans:return",
    "inspections:create",
    "inspections:read",
    "inspections:update",
    "transfers:create",
    "transfers:read",
    "transfers:update",
    "pricing:read",
  ],
  commercial_advisor: [
    "organization:read",
    "customers:create",
    "customers:read",
    "customers:update",
    "materials:read",
    "packages:read",
    "requests:create",
    "requests:read",
    "requests:update",
    "loans:create",
    "loans:read",
    "invoices:read",
    "pricing:read",
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
export const OWNER_ROLE_NAME = "owner" as const;

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
  name: DefaultOrganizationRole;
  permissions: string[];
  isReadOnly: boolean;
  type: "SYSTEM" | "CUSTOM";
  description: string;
}> = [
  {
    name: "owner",
    permissions: rolePermissions.owner,
    isReadOnly: true,
    type: "SYSTEM",
    description:
      "Organization owner — full access. System role, non-editable and non-deletable.",
  },
  {
    name: "manager",
    permissions: rolePermissions.manager,
    isReadOnly: false,
    type: "CUSTOM",
    description: "Default manager role — can be customized by the owner.",
  },
  {
    name: "warehouse_operator",
    permissions: rolePermissions.warehouse_operator,
    isReadOnly: false,
    type: "CUSTOM",
    description:
      "Default warehouse operator role — can be customized by the owner.",
  },
  {
    name: "commercial_advisor",
    permissions: rolePermissions.commercial_advisor,
    isReadOnly: false,
    type: "CUSTOM",
    description:
      "Default commercial advisor role — can be customized by the owner.",
  },
];

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
    message: "Invalid Organization ID format",
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
