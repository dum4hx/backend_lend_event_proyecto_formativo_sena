import type { Request, Response, NextFunction } from "express";
import type { ZodError } from "zod";
import { z } from "zod";
import { AppError } from "../errors/AppError.ts";

/* ---------- Validation Target ---------- */

type ValidationTarget = "body" | "query" | "params";

/* ---------- Validation Middleware Factory ---------- */

/**
 * Creates a validation middleware for the specified schema and target.
 */
export const validate = <T>(
  schema: z.ZodSchema<T>,
  target: ValidationTarget = "body",
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const data = req[target];
      const result = schema.safeParse(data);

      if (!result.success) {
        const errors = formatZodErrors(result.error);
        throw AppError.badRequest("Validation failed", { errors });
      }

      // Replace the target with the parsed (and transformed) data
      req[target] = result.data as (typeof req)[typeof target];

      next();
    } catch (err: unknown) {
      next(err);
    }
  };
};

/**
 * Validates request body.
 */
export const validateBody = <T>(schema: z.ZodSchema<T>) =>
  validate(schema, "body");

/**
 * Validates query parameters.
 */
export const validateQuery = <T>(schema: z.ZodSchema<T>) =>
  validate(schema, "query");

/**
 * Validates route parameters.
 */
export const validateParams = <T>(schema: z.ZodSchema<T>) =>
  validate(schema, "params");

/* ---------- Error Formatting ---------- */

interface ValidationError {
  field: string;
  message: string;
}

/**
 * Formats Zod errors into a more readable structure.
 */
const formatZodErrors = (error: ZodError): ValidationError[] => {
  return error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
};

/* ---------- Common Validation Schemas ---------- */

import { Types } from "mongoose";

/**
 * Schema for validating MongoDB ObjectId in params.
 */
export const objectIdParamSchema = z.object({
  id: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid ID format",
  }),
});

/**
 * Schema for pagination query parameters.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

/**
 * Schema for date range query parameters.
 */
export const dateRangeSchema = z
  .object({
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.startDate <= data.endDate;
      }
      return true;
    },
    { message: "startDate must be before or equal to endDate" },
  );
