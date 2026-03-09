import { Schema, model, type InferSchemaType } from "mongoose";

const EMAIL_VERIFY_EXPIRY_MINUTES = 5;

/* ---------- Email Verification Token Schema ---------- */

const emailVerificationTokenSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: "Organization",
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
    default: () =>
      new Date(Date.now() + EMAIL_VERIFY_EXPIRY_MINUTES * 60 * 1000),
    index: { expires: 0 }, // TTL index: auto-delete when expired
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

emailVerificationTokenSchema.index({ email: 1 }, { unique: true });

/* ---------- Export ---------- */

export type EmailVerificationTokenDocument = InferSchemaType<
  typeof emailVerificationTokenSchema
>;
export const EmailVerificationToken = model<EmailVerificationTokenDocument>(
  "EmailVerificationToken",
  emailVerificationTokenSchema,
);
