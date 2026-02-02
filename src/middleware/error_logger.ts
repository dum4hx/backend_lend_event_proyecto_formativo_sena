import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger.ts";

const errorLogger = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Log the error
  logger.error("Unexpected error occurred", err);

  // Respond to the client
  // If headers are already sent, delegate to the default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
};

export default errorLogger;
