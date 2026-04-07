import { z } from "zod";
import * as argon2 from "argon2";

import {
  Schema,
  model,
  type InferSchemaType,
  Types,
  type ValidatorProps,
} from "mongoose";
import { Role, rolePermissions } from "../../roles/models/role.model.ts";

/* ---------- User Status ---------- */

const userStatusOptions = [
  "active",
  "inactive",
  "invited",
  "suspended",
  "pending_email_verification",
] as const;

/* ---------- Zod Schema for API Validation ---------- */

const namePart = z.string().max(50, "Se permiten máximo 50 caracteres").trim();
const requiredNamePart = namePart.min(1, "Este campo es requerido");

export const UserZodSchema = z.object({
  name: z.object({
    firstName: requiredNamePart,
    secondName: namePart.optional().or(z.literal("")),
    firstSurname: requiredNamePart,
    secondSurname: namePart.optional().or(z.literal("")),
  }),
  email: z.email("Formato de correo electrónico no válido").lowercase().trim(),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, "Formato de telefono invalido (E.164)"),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(128, "La contraseña no debe exceder 128 caracteres")
    .regex(/[A-Z]/, "La contraseña debe contener al menos una letra mayúscula")
    .regex(/[a-z]/, "La contraseña debe contener al menos una letra minúscula")
    .regex(/[0-9]/, "La contraseña debe contener al menos un dígito")
    .regex(
      /[^A-Za-z0-9]/,
      "La contraseña debe contener al menos un carácter especial",
    ),
  roleId: z.string(),
  locations: z.array(
    z.string().refine((val) => Types.ObjectId.isValid(val), {
      message: "Formato de ID de ubicación no válido",
    }),
  ),
  organizationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de organización no válido",
  }),
});

export const UserUpdateZodSchema = UserZodSchema.partial().omit({
  organizationId: true,
  password: true,
});

export const PasswordUpdateZodSchema = z.object({
  currentPassword: z.string().min(1, "La contraseña actual es requerida"),
  newPassword: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(128, "La contraseña no debe exceder 128 caracteres")
    .regex(/[A-Z]/, "La contraseña debe contener al menos una letra mayúscula")
    .regex(/[a-z]/, "La contraseña debe contener al menos una letra minúscula")
    .regex(/[0-9]/, "La contraseña debe contener al menos un dígito")
    .regex(
      /[^A-Za-z0-9]/,
      "La contraseña debe contener al menos un carácter especial",
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
    phone: { type: String, required: true, trim: true },
    password: { type: String, required: true, select: false },
    locations: [{ type: Schema.Types.ObjectId, ref: "Location" }],
    roleId: {
      type: String,
      ref: "Role",
      required: true,
    },
    status: {
      type: String,
      enum: userStatusOptions,
      default: "active",
    },
    invitedAt: { type: Date, default: null },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    lastLoginAt: { type: Date, default: null },
    backupCodes: {
      type: [
        {
          codeHash: { type: String, required: true },
          used: { type: Boolean, default: false },
          usedAt: { type: Date, default: null },
        },
      ],
      select: false,
      default: undefined,
    },
  },
  {
    timestamps: true,
  },
);

/* ---------- Indexes ---------- */

// Compound unique index: email unique per organization
userSchema.index({ organizationId: 1, email: 1 }, { unique: true });
// Compound unique index: phone unique per organization (not globally)
userSchema.index({ organizationId: 1, phone: 1 }, { unique: true });
userSchema.index({ organizationId: 1, roleId: 1 });
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

userSchema.methods.getRoleName = async function (): Promise<string | null> {
  const role = await Role.findById(this.roleId).select("name").lean().exec();
  return role?.name ?? null;
};

userSchema.methods.hasPermissions = async function (
  permissionsToMatch: string[],
): Promise<boolean> {
  const role = await Role.findById(this.roleId)
    .select("permissions")
    .lean()
    .exec();
  const permissions = role?.permissions ?? [];
  return permissionsToMatch.every((perm) => permissions.includes(perm));
};

/* ---------- Export ---------- */

export type UserDocument = InferSchemaType<typeof userSchema> & {
  verifyPassword(password: string): Promise<boolean>;
  hasPermissions(permissionsToMatch: string[]): Promise<boolean>;
  getRoleName(): Promise<string | null>;
};

/* ---------- Export ---------- */

export const User = model<UserDocument>("User", userSchema);
