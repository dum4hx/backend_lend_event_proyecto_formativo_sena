import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError.ts";

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
// import { type NextFunction, type Request, type Response } from "express";
// import { AppError } from "../errors/AppError.ts";

// /**
//  * Sends a JSON response for errors.
//  * If the error is an `AppError`, it uses the status code and message from it.
//  * Otherwise, it sends a generic 500 Internal Server Error.
//  */
// export const errorResponder = (
//   err: Error,
//   req: Request,
//   res: Response,
//   next: NextFunction,
// ): void => {
//   if (err instanceof AppError) {
//     res.status(err.statusCode).json({
//       status: err.code,
//       message: err.message,
//       code: err.code,
//     });
//   } else {
//     const error = AppError.internal("An unexpected error occurred", err);
//     res.status(error.statusCode).json({
//       status: error.code,
//       message: error.message,
//     });
//   }
// };
