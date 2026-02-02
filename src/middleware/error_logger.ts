import type { NextFunction, Request, Response } from "express";
import logger from "../utils/logger.ts";

// Define express middleware

const error_logger = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  logger.error(err.message, err);

  // Delegate to express error handler if headers sent
  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({ message: err.message });
};

export default error_logger;
