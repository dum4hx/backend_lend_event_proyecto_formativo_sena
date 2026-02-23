import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";
import {
  userRoleOptions,
  rolePermissions,
} from "../../user/models/user.model.ts";

// Zod schema for API validation
export const RoleZodSchema = z.object({
  name: z
    .string()
    .refine((val) => (userRoleOptions as readonly string[]).includes(val), {
      message: "Invalid role name",
    }),
  permissions: z.array(z.string()).optional(),
  organizationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Organization ID format",
  }),
  description: z.string().max(500).trim().optional(),
});

export type RoleInput = z.infer<typeof RoleZodSchema>;

// Mongoose schema
const roleSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      enum: userRoleOptions as unknown as string[],
      trim: true,
    },
    permissions: {
      type: [String],
      default: function (this: any) {
        return (rolePermissions as Record<string, string[]>)[this.name] ?? [];
      },
    },
    description: { type: String, maxlength: 500, trim: true },
  },
  {
    timestamps: true,
  },
);

// Ensure a role name is unique within an organization
roleSchema.index({ organizationId: 1, name: 1 }, { unique: true });

export type RoleDocument = InferSchemaType<typeof roleSchema>;
export const Role = model<RoleDocument>("Role", roleSchema);
