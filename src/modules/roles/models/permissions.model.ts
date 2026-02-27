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
  "Invoices",
  "Reports",
  "Platform",
  "Customers",
  "Analytics",
  "Roles",
  "Subscription_types",
  "Subscription",
] as const;

export type PermissionCategory = (typeof permissionCategories)[number];

/* ---------- Zod Schema for API Validation ---------- */

export const PermissionZodSchema = z.object({
  _id: z
    .string()
    .min(3)
    .regex(/^[a-z_]+:[a-z_]+$/, "Format must be 'resource:action'"),
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
