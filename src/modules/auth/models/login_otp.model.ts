import { Schema, model, type InferSchemaType } from "mongoose";

/* ---------- Login OTP Schema ---------- */

const loginOtpSchema = new Schema({
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

loginOtpSchema.index({ email: 1 });

/* ---------- Export ---------- */

export type LoginOtpDocument = InferSchemaType<typeof loginOtpSchema>;
export const LoginOtp = model<LoginOtpDocument>("LoginOtp", loginOtpSchema);
