import { z } from "zod";
import * as argon2 from "argon2";

import {
  Schema,
  model,
  type InferSchemaType,
  Types,
  type ValidatorProps,
} from "mongoose";

/* ---------- User Roles (RBAC) ---------- */

export const userRoleOptions = [
  "super_admin", // Software owner
  "owner",
  "manager",
  "warehouse_operator",
  "commercial_advisor",
] as const;

export type UserRole = (typeof userRoleOptions)[number];

// Role permissions map
export const rolePermissions: Record<UserRole, string[]> = {
  super_admin: [
    // Super admin has full platform access
    "subscription_types:create",
    "subscription_types:read",
    "subscription_types:update",
    "subscription_types:delete",
    "platform:manage",
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
  ],
  owner: [
    // Full access
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
    "analytics:read",
  ],
  manager: [
    "organization:read",
    "users:read",
    "customers:read",
    "materials:create",
    "materials:read",
    "materials:update",
    "materials:delete",
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
  ],
};

/* ---------- User Status ---------- */

const userStatusOptions = [
  "active",
  "inactive",
  "invited",
  "suspended",
] as const;

/* ---------- Zod Schema for API Validation ---------- */

const namePart = z.string().max(50, "Maximum 50 characters allowed").trim();
const requiredNamePart = namePart.min(1, "This field is required");

export const UserZodSchema = z.object({
  name: z.object({
    firstName: requiredNamePart,
    secondName: namePart.optional().or(z.literal("")),
    firstSurname: requiredNamePart,
    secondSurname: namePart.optional().or(z.literal("")),
  }),
  email: z.email("Invalid email format").lowercase().trim(),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone format (E.164)"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must not exceed 128 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one digit")
    .regex(
      /[^A-Za-z0-9]/,
      "Password must contain at least one special character",
    ),
  role: z.enum(userRoleOptions).default("commercial_advisor"),
  organizationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Organization ID format",
  }),
});

export const UserUpdateZodSchema = UserZodSchema.partial().omit({
  organizationId: true,
  password: true,
});

export const PasswordUpdateZodSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must not exceed 128 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one digit")
    .regex(
      /[^A-Za-z0-9]/,
      "Password must contain at least one special character",
    ),
});

// Create a type for TypeScript logic
export type UserInput = z.infer<typeof UserZodSchema>;

/* ---------- User Name Field Schema ---------- */

const userNameSchema = new Schema(
  {
    firstName: {
      type: String,
      required: true,
      maxlength: 50,
      trim: true,
    },
    secondName: {
      type: String,
      required: false,
      maxlength: 50,
      trim: true,
    },
    firstSurname: {
      type: String,
      required: true,
      maxlength: 50,
      trim: true,
    },
    secondSurname: {
      type: String,
      required: false,
      maxlength: 50,
      trim: true,
    },
  },
  {
    _id: false,
  },
);

/* ---------- User Mongoose Schema ---------- */

const userSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: userNameSchema,
    email: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) =>
          UserZodSchema.shape.email.safeParse(v).success,
        message: (props: ValidatorProps) =>
          `${props.value} is not a valid email!`,
      },
    },
    phone: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: userRoleOptions,
      default: "commercial_advisor",
    },
    status: {
      type: String,
      enum: userStatusOptions,
      default: "active",
    },
    invitedAt: { type: Date, default: null },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

/* ---------- Indexes ---------- */

// Compound unique index: email unique per organization
userSchema.index({ organizationId: 1, email: 1 }, { unique: true });
userSchema.index({ organizationId: 1, role: 1 });
userSchema.index({ organizationId: 1, status: 1 });

/* ---------- Pre-save Middleware ---------- */

userSchema.pre("save", async function () {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified("password")) {
    return;
  }

  // Save password as hash
  this.password = await argon2.hash(this.password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16, // 64MB
    timeCost: 3, // Number of iterations
    parallelism: 1, // Number of threads
  });
});

/* ---------- Instance Methods ---------- */

userSchema.methods.verifyPassword = async function (
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(this.password, password);
  } catch {
    return false;
  }
};

userSchema.methods.hasPermission = function (permission: string): boolean {
  const permissions = rolePermissions[this.role as UserRole] ?? [];
  return permissions.includes(permission);
};

/* ---------- Export ---------- */

export type UserDocument = InferSchemaType<typeof userSchema> & {
  verifyPassword(password: string): Promise<boolean>;
  hasPermission(permission: string): boolean;
};

export const User = model<UserDocument>("User", userSchema);
