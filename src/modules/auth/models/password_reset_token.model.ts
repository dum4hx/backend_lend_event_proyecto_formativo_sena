import { Schema, model, type InferSchemaType } from "mongoose";

/* ---------- Password Reset Token Schema ---------- */

const passwordResetTokenSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  code: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 }, // TTL index: auto-delete when expired
  },
  verified: {
    type: Boolean,
    default: false,
  },
  attempts: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

/* ---------- Indexes ---------- */

passwordResetTokenSchema.index({ email: 1, code: 1 });

/* ---------- Export ---------- */

export type PasswordResetTokenDocument = InferSchemaType<
  typeof passwordResetTokenSchema
>;
export const PasswordResetToken = model<PasswordResetTokenDocument>(
  "PasswordResetToken",
  passwordResetTokenSchema,
);
