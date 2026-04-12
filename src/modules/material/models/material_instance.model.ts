import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";
import { Location } from "../../location/models/location.model.ts";

// Material instance statuses
const materialStatusOptions: string[] = [
  "available",
  "reserved",
  "loaned",
  "returned",
  "maintenance",
  "damaged",
  "lost",
  "retired",
];

// Zod schema for API validation
// TODO: Consider adding more fields like purchaseDate, warrantyExpiry, etc. in the future
export const MaterialInstanceZodSchema = z.object({
  organizationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de organización no válido",
  }),
  modelId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de modelo de material no válido",
  }),
  serialNumber: z
    .string()
    .min(1, "El número de serie es requerido")
    .max(100, "Máximo 100 caracteres")
    .trim(),
  notes: z.string().max(500, "Máximo 500 caracteres").trim().optional(),
  status: z
    .enum([
      "available",
      "reserved",
      "loaned",
      "returned",
      "maintenance",
      "damaged",
      "lost",
      "retired",
    ])
    .default("available"),
  locationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Formato de ID de ubicación no válido",
  }),
  attributes: z
    .array(
      z.object({
        attributeId: z.string().refine((val) => Types.ObjectId.isValid(val), {
          message: "Formato de ID de atributo no válido",
        }),
        value: z.string().max(100, "Máximo 100 caracteres").trim(),
      }),
    )
    .optional(),
  barcode: z
    .string()
    .trim()
    .max(120, "Máximo 120 caracteres")
    .refine((val) => val.length > 0, {
      message: "El código de barras no puede estar vacío",
    })
    .optional(),
  useBarcodeAsSerial: z.boolean().optional(),
  /**
   * Optional flag to ignore capacity warnings
   * If true, allows the operation even if the location is at full capacity
   */
  force: z.boolean().optional().default(false),
});

const serialNumberSchema = z
  .string()
  .trim()
  .max(100, "Máximo 100 caracteres")
  .refine((val) => val.length > 0, {
    message: "El número de serie no puede estar vacío",
  });

const barcodeSchema = z
  .string()
  .trim()
  .max(120, "Máximo 120 caracteres")
  .refine((val) => val.length > 0, {
    message: "El código de barras no puede estar vacío",
  });

export const MaterialInstanceCreateZodSchema = z
  .object({
    modelId: z.string().refine((val) => Types.ObjectId.isValid(val), {
      message: "Formato de ID de modelo de material no válido",
    }),
    locationId: z.string().refine((val) => Types.ObjectId.isValid(val), {
      message: "Formato de ID de ubicación no válido",
    }),
    serialNumber: serialNumberSchema.optional(),
    barcode: barcodeSchema.optional(),
    useBarcodeAsSerial: z.boolean().optional(),
    notes: z.string().max(500, "Máximo 500 caracteres").trim().optional(),
    status: z
      .enum([
        "available",
        "reserved",
        "loaned",
        "returned",
        "maintenance",
        "damaged",
        "lost",
        "retired",
      ])
      .default("available"),
    attributes: z
      .array(
        z.object({
          attributeId: z.string().refine((val) => Types.ObjectId.isValid(val), {
            message: "Formato de ID de atributo no válido",
          }),
          value: z.string().max(100, "Máximo 100 caracteres").trim(),
        }),
      )
      .optional(),
    force: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.useBarcodeAsSerial === true && !data.barcode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["barcode"],
        message: "barcode es requerido cuando useBarcodeAsSerial es verdadero",
      });
    }
  });

export const MaterialInstanceUpdateZodSchema = z
  .object({
    modelId: z
      .string()
      .refine((val) => Types.ObjectId.isValid(val), {
        message: "Formato de ID de modelo de material no válido",
      })
      .optional(),
    locationId: z
      .string()
      .refine((val) => Types.ObjectId.isValid(val), {
        message: "Formato de ID de ubicación no válido",
      })
      .optional(),
    serialNumber: serialNumberSchema.optional(),
    barcode: barcodeSchema.optional(),
    useBarcodeAsSerial: z.boolean().optional(),
    notes: z.string().max(500, "Máximo 500 caracteres").trim().optional(),
    attributes: z
      .array(
        z.object({
          attributeId: z.string().refine((val) => Types.ObjectId.isValid(val), {
            message: "Formato de ID de atributo no válido",
          }),
          value: z.string().max(100, "Máximo 100 caracteres").trim(),
        }),
      )
      .optional(),
    force: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message:
      "Se requiere al menos un campo para actualizar la instancia de material",
  });

export type MaterialInstanceInput = z.infer<typeof MaterialInstanceZodSchema>;

// Material Instance mongoose schema
const materialInstanceSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    modelId: {
      type: Schema.Types.ObjectId,
      ref: "MaterialType",
      required: true,
    },
    serialNumber: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
    },
    notes: {
      type: String,
      maxlength: 500,
      trim: true,
    },
    status: {
      type: String,
      enum: materialStatusOptions,
      default: "available",
    },
    locationId: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: true,
    },
    barcode: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    attributes: [
      {
        attributeId: {
          type: Schema.Types.ObjectId,
          ref: "Attribute",
          required: true,
        },
        value: {
          type: String,
          maxlength: 100,
          trim: true,
          required: true,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Indexes for better query performance
materialInstanceSchema.index({ modelId: 1 });
materialInstanceSchema.index({ locationId: 1 });
materialInstanceSchema.index({ status: 1 });

// Ensure serial numbers are unique within an organization
materialInstanceSchema.index(
  { organizationId: 1, serialNumber: 1 },
  { unique: true },
);

// Ensure barcodes are unique within an organization (allow null / empty for legacy records)
materialInstanceSchema.index(
  { organizationId: 1, barcode: 1 },
  {
    unique: true,
    partialFilterExpression: { barcode: { $type: "string", $gt: "" } },
  },
);

/**
 * ============================================================================
 * MIDDLEWARE / HOOKS
 * Must be registered BEFORE model() is compiled so Mongoose includes them.
 * ============================================================================
 */

/**
 * Helper to update the currentQuantity in the location's materialCapacities
 */
async function updateLocationQuantity(
  locationId: Types.ObjectId | string,
  modelId: Types.ObjectId | string,
  increment: number,
) {
  if (!locationId || !modelId) return;

  await Location.updateOne(
    {
      _id: locationId,
      "materialCapacities.materialTypeId": modelId,
    },
    {
      $inc: { "materialCapacities.$.currentQuantity": increment },
    },
  );
}

/**
 * Handle quantity updates after a change
 */
async function handleUpdateQuantity(original: any, updated: any) {
  if (!original || !updated) return;

  const oldLoc = original.locationId.toString();
  const newLoc = updated.locationId.toString();
  const oldModel = original.modelId.toString();
  const newModel = updated.modelId.toString();
  const oldActive = original.status !== "retired";
  const newActive = updated.status !== "retired";

  // If both were active, check if they moved or changed type
  if (oldActive && newActive) {
    if (oldLoc !== newLoc || oldModel !== newModel) {
      await updateLocationQuantity(oldLoc, oldModel, -1);
      await updateLocationQuantity(newLoc, newModel, 1);
    }
  }
  // If it was active and now it's retired
  else if (oldActive && !newActive) {
    await updateLocationQuantity(oldLoc, oldModel, -1);
  }
  // If it was retired and now it's active
  else if (!oldActive && newActive) {
    await updateLocationQuantity(newLoc, newModel, 1);
  }
}

/**
 * Pre-save hook to capture original state for non-new saves
 */
materialInstanceSchema.pre("save", async function () {
  if (!this.isNew) {
    const original = await (this.constructor as any)
      .findById(this._id)
      .select("locationId modelId status");
    (this as any)._originalDoc = original;
  }
});

/**
 * Post-save hook to increment quantity when a new instance is created.
 * Skipped for updates (identified by the presence of _originalDoc).
 */
materialInstanceSchema.post("save", async function (doc) {
  // Skip for updates — handled by the update hook below
  if ((this as any)._originalDoc) return;
  try {
    if (doc.status !== "retired") {
      await updateLocationQuantity(doc.locationId, doc.modelId, 1);
    }
  } catch (error) {
    console.error("Error in MaterialInstance post-save new hook:", error);
  }
});

/**
 * Post-save hook to adjust quantities when an existing instance is updated.
 */
materialInstanceSchema.post("save", async function (doc) {
  if (!(this as any)._originalDoc) return;
  try {
    await handleUpdateQuantity((this as any)._originalDoc, doc);
  } catch (error) {
    console.error("Error in MaterialInstance post-save update hook:", error);
  }
});

/**
 * Pre-findOneAndUpdate hook to capture the original document state
 */
materialInstanceSchema.pre("findOneAndUpdate", async function () {
  const query = this.getQuery();
  const docToUpdate = await this.model
    .findOne(query)
    .select("locationId modelId status");
  if (docToUpdate) {
    (this as any)._originalDoc = docToUpdate.toObject();
  }
});

/**
 * Post-findOneAndUpdate hook to handle location or model changes
 */
materialInstanceSchema.post(
  "findOneAndUpdate",
  async function (this: any, doc) {
    if (!doc) return;

    try {
      const original = (this as any)._originalDoc;
      if (!original) return;
      await handleUpdateQuantity(original, doc);
    } catch (error) {
      console.error(
        "Error in MaterialInstance post-findOneAndUpdate hook:",
        error,
      );
    }
  },
);

export type MaterialInstanceDocument = InferSchemaType<
  typeof materialInstanceSchema
>;
export const MaterialInstance = model<MaterialInstanceDocument>(
  "MaterialInstance",
  materialInstanceSchema,
);
