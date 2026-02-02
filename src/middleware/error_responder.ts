import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/types/AppError.ts";

interface ErrorResponsePayload {
  status: "error" | "fail";
  code: string;
  message: string;
  details?: unknown;
  // requestId?: string;
}

export const errorResponder = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // If headers are already sent, delegate to Express' default handler
  if (res.headersSent) {
    next(err);
    return;
  }

  let appError: AppError;

  // Normalize all errors into AppError
  if (err instanceof AppError) {
    appError = err;
  } else {
    appError = AppError.internal("An unexpected error occurred", err);
  }

  const payload: ErrorResponsePayload = {
    status: appError.statusCode >= 500 ? "error" : "fail",
    code: appError.code,
    message:
      process.env.NODE_ENV === "production" && !appError.isOperational
        ? "Internal Server Error"
        : appError.message,
  };

  if (appError.details !== undefined) {
    payload.details = appError.details;
  }

  res.status(appError.statusCode).json(payload);
};
