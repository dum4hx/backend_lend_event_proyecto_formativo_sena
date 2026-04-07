import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

/* ---------- Strategy Types ---------- */

export const pricingStrategyOptions = [
  "per_day",
  "weekly_monthly",
  "fixed",
] as const;

export type PricingStrategy = (typeof pricingStrategyOptions)[number];

export const PricingStrategyZod = z.enum(pricingStrategyOptions);

/* ---------- Scope Types ---------- */

export const pricingScopeOptions = [
  "organization",
  "materialType",
  "package",
] as const;

export type PricingScope = (typeof pricingScopeOptions)[number];

/* ---------- Zod Schemas for Params ---------- */

export const perDayParamsZod = z.object({
  overridePricePerDay: z
    .number()
    .positive("El precio de anulación debe ser positivo")
    .optional(),
});

export const weeklyMonthlyParamsZod = z.object({
  weeklyPrice: z
    .number()
    .positive("El precio semanal debe ser positivo")
    .optional(),
  weeklyThreshold: z
    .number()
    .int()
    .min(2, "El umbral semanal debe ser al menos 2 días")
    .default(7),
  monthlyPrice: z
    .number()
    .positive("El precio mensual debe ser positivo")
    .optional(),
  monthlyThreshold: z
    .number()
    .int()
    .min(7, "El umbral mensual debe ser al menos 7 días")
    .default(30),
});

export const fixedParamsZod = z.object({
  flatPrice: z.number().positive("El precio fijo debe ser positivo"),
});

/* ---------- Create / Update Zod Schema ---------- */

const pricingConfigBaseSchema = z.object({
  scope: z.enum(pricingScopeOptions),
  referenceId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de referencia no válido",
  }),
  strategyType: PricingStrategyZod,
  perDayParams: perDayParamsZod.optional(),
  weeklyMonthlyParams: weeklyMonthlyParamsZod.optional(),
  fixedParams: fixedParamsZod.optional(),
});

export const PricingConfigCreateZodSchema = pricingConfigBaseSchema.superRefine(
  (data, ctx) => {
    if (data.strategyType === "fixed" && !data.fixedParams?.flatPrice) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fixedParams"],
        message: "fixedParams.flatPrice es requerido para la estrategia fija",
      });
    }
    if (data.strategyType === "weekly_monthly") {
      const p = data.weeklyMonthlyParams;
      if (!p?.weeklyPrice && !p?.monthlyPrice) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["weeklyMonthlyParams"],
          message:
            "Al menos uno de weeklyPrice o monthlyPrice es requerido para la estrategia weekly_monthly",
        });
      }
    }
  },
);

export const PricingConfigUpdateZodSchema = pricingConfigBaseSchema
  .omit({ scope: true, referenceId: true })
  .partial()
  .superRefine((data, ctx) => {
    if (data.strategyType === "fixed" && !data.fixedParams?.flatPrice) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fixedParams"],
        message: "fixedParams.flatPrice es requerido para la estrategia fija",
      });
    }
    if (data.strategyType === "weekly_monthly") {
      const p = data.weeklyMonthlyParams;
      if (!p?.weeklyPrice && !p?.monthlyPrice) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["weeklyMonthlyParams"],
          message:
            "Al menos uno de weeklyPrice o monthlyPrice es requerido para la estrategia weekly_monthly",
        });
      }
    }
  });

export type PricingConfigCreateInput = z.infer<
  typeof PricingConfigCreateZodSchema
>;
export type PricingConfigUpdateInput = z.infer<
  typeof PricingConfigUpdateZodSchema
>;

/* ---------- Preview Zod Schema ---------- */

export const PricingPreviewZodSchema = z.object({
  itemType: z.enum(["material", "package"]),
  referenceId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de referencia no válido",
  }),
  quantity: z.number().int().positive().default(1),
  durationInDays: z.number().positive("La duración debe ser positiva"),
});

export type PricingPreviewInput = z.infer<typeof PricingPreviewZodSchema>;

/* ---------- Mongoose Sub-Schemas for Params ---------- */

const perDayParamsMongooseSchema = new Schema(
  {
    overridePricePerDay: { type: Number, min: 0.01 },
  },
  { _id: false },
);

const weeklyMonthlyParamsMongooseSchema = new Schema(
  {
    weeklyPrice: { type: Number, min: 0.01 },
    weeklyThreshold: { type: Number, min: 2, default: 7 },
    monthlyPrice: { type: Number, min: 0.01 },
    monthlyThreshold: { type: Number, min: 7, default: 30 },
  },
  { _id: false },
);

const fixedParamsMongooseSchema = new Schema(
  {
    flatPrice: { type: Number, required: true, min: 0.01 },
  },
  { _id: false },
);

/* ---------- PricingConfig Mongoose Schema ---------- */

const pricingConfigSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    scope: {
      type: String,
      enum: pricingScopeOptions,
      required: true,
    },
    referenceId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    strategyType: {
      type: String,
      enum: pricingStrategyOptions,
      required: true,
    },
    perDayParams: {
      type: perDayParamsMongooseSchema,
    },
    weeklyMonthlyParams: {
      type: weeklyMonthlyParamsMongooseSchema,
    },
    fixedParams: {
      type: fixedParamsMongooseSchema,
    },
  },
  {
    timestamps: true,
  },
);

/* ---------- Indexes ---------- */

// Ensures one config per (org, scope, referenceId) combination
pricingConfigSchema.index(
  { organizationId: 1, scope: 1, referenceId: 1 },
  { unique: true },
);

/* ---------- Export ---------- */

export type PricingConfigDocument = InferSchemaType<typeof pricingConfigSchema>;

export const PricingConfig = model<PricingConfigDocument>(
  "PricingConfig",
  pricingConfigSchema,
);
