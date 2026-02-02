import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger.ts";

export const requestMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  logger.info("HTTP request", {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
  });
  next();
};
