import { z } from "zod";
import { Types } from "mongoose";
import {
  ticketTypeOptions,
  ticketStatusOptions,
} from "./models/ticket.model.ts";

/* ---------- Helpers ---------- */

const objectIdString = (fieldLabel: string) =>
  z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: `Formato de ID de ${fieldLabel} no válido`,
  });

/* ---------- Payload Schemas (per ticket type) ---------- */

export const transferRequestPayloadSchema = z.object({
  toLocationId: objectIdString("ubicación de destino"),
  items: z
    .array(
      z.object({
        materialTypeId: objectIdString("tipo de material"),
        quantity: z.number().int().min(1, "La cantidad debe ser al menos 1"),
      }),
    )
    .min(1, "Se debe solicitar al menos un elemento"),
  neededBy: z
    .string()
    .datetime({ message: "neededBy debe ser una fecha ISO válida" })
    .optional(),
});

export const incidentReportPayloadSchema = z.object({
  materialInstanceIds: z
    .array(objectIdString("instancia de material"))
    .optional(),
  loanId: objectIdString("préstamo").optional(),
  severity: z.enum(["low", "medium", "high", "critical"], {
    error: "La severidad debe ser low, medium, high o critical",
  }),
  context: z.enum(["transit", "storage", "loan", "maintenance", "other"], {
    error: "El contexto debe ser transit, storage, loan, maintenance u other",
  }),
  description: z.string().max(2000, "Máximo 2000 caracteres").optional(),
});

export const maintenanceRequestPayloadSchema = z.object({
  materialInstanceIds: z
    .array(objectIdString("instancia de material"))
    .min(1, "Se debe incluir al menos una instancia de material"),
  entryReason: z.enum(["damaged", "other"], {
    error: "La razón de entrada debe ser damaged u other",
  }),
  estimatedCost: z
    .number()
    .min(0, "El costo estimado no puede ser negativo")
    .optional(),
  notes: z.string().max(1000, "Máximo 1000 caracteres").optional(),
});

export const inspectionRequestPayloadSchema = z.object({
  loanId: objectIdString("préstamo"),
  notes: z.string().max(1000, "Máximo 1000 caracteres").optional(),
});

export const genericPayloadSchema = z.object({
  details: z
    .string()
    .min(1, "Los detalles son requeridos")
    .max(2000, "Máximo 2000 caracteres"),
});

export const createTransferFromTicketSchema = z.object({
  fromLocationId: objectIdString("ubicación de origen"),
  notes: z.string().max(500, "Máximo 500 caracteres").trim().optional(),
});

/** Maps ticket type → payload validation schema. */
export const payloadSchemasByType: Record<string, z.ZodType> = {
  transfer_request: transferRequestPayloadSchema,
  incident_report: incidentReportPayloadSchema,
  maintenance_request: maintenanceRequestPayloadSchema,
  inspection_request: inspectionRequestPayloadSchema,
  generic: genericPayloadSchema,
};

/* ---------- Request Body Schemas ---------- */

export const createTicketBodySchema = z.object({
  locationId: objectIdString("ubicación"),
  type: z.enum(ticketTypeOptions, {
    error: `El tipo debe ser uno de: ${ticketTypeOptions.join(", ")}`,
  }),
  title: z
    .string()
    .min(1, "El título es requerido")
    .max(200, "El título no puede exceder 200 caracteres")
    .trim(),
  description: z
    .string()
    .max(2000, "La descripción no puede exceder 2000 caracteres")
    .trim()
    .optional(),
  assigneeId: objectIdString("destinatario").optional(),
  responseDeadline: z
    .string()
    .datetime({
      message: "La fecha límite de respuesta debe ser una fecha ISO válida",
    })
    .optional(),
  payload: z.record(z.string(), z.unknown()),
});

export type CreateTicketBody = z.infer<typeof createTicketBodySchema>;

export const resolveTicketBodySchema = z.object({
  resolutionNote: z
    .string()
    .max(1000, "La nota de resolución no puede exceder 1000 caracteres")
    .trim()
    .optional(),
});

export const rejectTicketBodySchema = z.object({
  resolutionNote: z
    .string()
    .min(1, "La nota de resolución es requerida al rechazar un ticket")
    .max(1000, "La nota de resolución no puede exceder 1000 caracteres")
    .trim(),
});

/* ---------- Query Schemas ---------- */

export const listTicketsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20)),
  status: z.enum(ticketStatusOptions).optional(),
  type: z.enum(ticketTypeOptions).optional(),
  locationId: objectIdString("ubicación").optional(),
});

export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;

export const capableUsersQuerySchema = z.object({
  type: z.enum(ticketTypeOptions, {
    error: `El tipo debe ser uno de: ${ticketTypeOptions.join(", ")}`,
  }),
  locationId: objectIdString("ubicación"),
});

export type CapableUsersQuery = z.infer<typeof capableUsersQuerySchema>;
