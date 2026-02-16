import { Schema, model, type InferSchemaType } from "mongoose";

/* ---------- Invite Token Schema ---------- */

const INVITE_EXPIRY_HOURS = parseInt(
  process.env.INVITE_EXPIRY_HOURS || "48",
  10,
);

const inviteTokenSchema = new Schema({
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
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  tokenHash: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000),
    index: { expires: 0 }, 
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

/* ---------- Indexes ---------- */

inviteTokenSchema.index({ email: 1 });
inviteTokenSchema.index({ tokenHash: 1 }, { unique: true });

/* ---------- Export ---------- */

export type InviteTokenDocument = InferSchemaType<typeof inviteTokenSchema>;
export const InviteToken = model<InviteTokenDocument>(
  "InviteToken",
  inviteTokenSchema,
);
