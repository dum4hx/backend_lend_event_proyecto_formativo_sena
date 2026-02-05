import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger.ts";
import { AppError } from "../errors/AppError.ts";

const errorLogger = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  let appError: AppError;
  // Turn err into AppError if it is not already (meaning it's an unexpected error)
  next(err);
  if (!(err instanceof AppError)) {
    appError = AppError.internal("An unexpected error occurred", err);
    logger.error(`Unexpected Error: ${appError.message}`, {
      stack: appError.stack,
      details: appError.details,
    });
  } else {
    appError = err;
    if (appError.isOperational) {
      logger.warn(`Operational Error: ${appError.message}`, {
        stack: appError.stack,
        details: appError.details,
      });
    } else {
      logger.error(`Critical Error: ${appError.message}`, appError.cause);
    }
  }

  next(appError);
};

export default errorLogger;
