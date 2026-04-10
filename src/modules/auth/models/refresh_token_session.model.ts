import { Schema, model, type InferSchemaType } from "mongoose";

/* ---------- Refresh Token Session Schema ---------- */

const refreshTokenSessionSchema = new Schema({
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
  tokenHash: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  replacedByTokenHash: {
    type: String,
    required: false,
  },
  revokedAt: {
    type: Date,
    required: false,
    default: null,
    index: true,
  },
  lastUsedAt: {
    type: Date,
    required: false,
    default: null,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

/* ---------- Indexes ---------- */

refreshTokenSessionSchema.index({ userId: 1, organizationId: 1, revokedAt: 1 });
refreshTokenSessionSchema.index({ userId: 1, revokedAt: 1 });

/* ---------- Export ---------- */

export type RefreshTokenSessionDocument = InferSchemaType<
  typeof refreshTokenSessionSchema
>;

export const RefreshTokenSession = model<RefreshTokenSessionDocument>(
  "RefreshTokenSession",
  refreshTokenSessionSchema,
);
