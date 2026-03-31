import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { logger } from "../utils/logger.ts";

export const requestMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Attach a correlation ID to every request (use client-provided header or generate one)
  const correlationId = (req.headers["x-request-id"] as string) || randomUUID();
  req.correlationId = correlationId;
  res.setHeader("X-Request-Id", correlationId);

  logger.info("HTTP request", {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    correlationId,
  });
  next();
};
