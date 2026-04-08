import { z } from "zod";
import { Schema, model, type InferSchemaType } from "mongoose";

/* ---------- Permission Categories ---------- */

export const permissionCategories = [
  "Organization",
  "Users",
  "Billing",
  "Materials",
  "Packages",
  "Requests",
  "Loans",
  "Inspections",
  "Incidents",
  "Invoices",
  "Reports",
  "Platform",
  "Customers",
  "Analytics",
  "Roles",
  "Subscription_types",
  "Subscription",
  "Permissions",
  "Locations",
  "Transfers",
  "Pricing",
  "Payment_methods",
  "Operations",
  "Maintenance",
  "Code_schemes",
] as const;

export type PermissionCategory = (typeof permissionCategories)[number];

/* ---------- Zod Schema for API Validation ---------- */

export const PermissionZodSchema = z.object({
  _id: z
    .string()
    .min(3)
    .regex(/^[a-z_]+(?::[a-z_]+)+$/, "Format must be 'resource:action'"),
  displayName: z.string().min(1).max(100).trim(),
  description: z.string().max(500).trim(),
  category: z.enum(permissionCategories),
  isActive: z.boolean().default(true),
});

export type PermissionInput = z.infer<typeof PermissionZodSchema>;

/* ---------- Permission Mongoose Schema ---------- */

const permissionSchema = new Schema(
  {
    /**
     * The unique string identifier for the permission.
     * Example: "users:create"
     */
    _id: {
      type: String,
      required: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: permissionCategories,
      required: true,
      index: true,
    },
    /**
     * Indicates if this is a platform-level permission that should only be assignable to system roles, or an organization-level permission that can be assigned to custom roles. This allows us to enforce that certain critical permissions are only granted to system-defined roles and not accidentally assigned to custom roles.
     */
    isPlatformPermission: {
      type: Boolean,
      default: false,
      required: true,
    },
    /**
     * Allows to "soft-disable" a feature across the app
     * without deleting the permission definition.
     */
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    _id: false, // We provide our own string _id
  },
);

/* ---------- Export ---------- */

export type PermissionDocument = InferSchemaType<typeof permissionSchema>;
export const Permission = model<PermissionDocument>(
  "Permission",
  permissionSchema,
);
