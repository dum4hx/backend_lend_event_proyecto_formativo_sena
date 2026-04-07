import { Schema, model, type InferSchemaType } from "mongoose";

/* ---------- Mongoose Schema ---------- */

const codeCounterSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    schemeId: {
      type: Schema.Types.ObjectId,
      ref: "CodeScheme",
      required: true,
    },
    scopeKey: {
      type: String,
      required: true,
    },
    currentValue: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

/* ---------- Indexes ---------- */

// One counter per (organization, scheme, scope) — unique
codeCounterSchema.index(
  { organizationId: 1, schemeId: 1, scopeKey: 1 },
  { unique: true },
);

/* ---------- Export ---------- */

export type CodeCounterDocument = InferSchemaType<typeof codeCounterSchema>;
export const CodeCounter = model<CodeCounterDocument>(
  "CodeCounter",
  codeCounterSchema,
);
