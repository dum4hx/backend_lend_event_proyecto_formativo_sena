import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError.ts";

/* ---------- Rate Limit Store ---------- */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store (consider Redis for production with multiple instances)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 60_000); // Clean every minute

/* ---------- Rate Limiter Configuration ---------- */

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator?: (req: Request) => string; // Custom key generator
  skipFailedRequests?: boolean; // Don't count failed requests
  message?: string; // Custom error message
}

const defaultKeyGenerator = (req: Request): string => {
  // Use user ID if authenticated, otherwise use IP
  if (req.user) {
    return `user:${req.user.userId.toString()}`;
  }
  return `ip:${req.ip ?? req.socket.remoteAddress ?? "unknown"}`;
};

/* ---------- Rate Limiter Factory ---------- */

/**
 * Creates a rate limiting middleware with the specified options.
 */
export const createRateLimiter = (options: RateLimitOptions) => {
  const {
    windowMs,
    maxRequests,
    keyGenerator = defaultKeyGenerator,
    message = "Too many requests. Please try again later.",
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator(req);
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    // Initialize or reset if window has passed
    if (!entry || entry.resetAt <= now) {
      entry = {
        count: 0,
        resetAt: now + windowMs,
      };
      rateLimitStore.set(key, entry);
    }

    // Increment request count
    entry.count++;

    // Set rate limit headers
    const remaining = Math.max(0, maxRequests - entry.count);
    const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);

    res.setHeader("X-RateLimit-Limit", maxRequests.toString());
    res.setHeader("X-RateLimit-Remaining", remaining.toString());
    res.setHeader("X-RateLimit-Reset", resetSeconds.toString());

    // Check if limit exceeded
    if (entry.count > maxRequests) {
      res.setHeader("Retry-After", resetSeconds.toString());
      next(
        new AppError({
          message,
          statusCode: 429,
          code: "RATE_LIMIT_EXCEEDED",
          details: {
            retryAfter: resetSeconds,
            limit: maxRequests,
            windowMs,
          },
        }),
      );
      return;
    }

    next();
  };
};

/* ---------- Pre-configured Rate Limiters ---------- */

/**
 * General API rate limiter.
 * 100 requests per minute per user/IP.
 */
export const generalRateLimiter = createRateLimiter({
  windowMs: 60_000, // 1 minute
  maxRequests: 100,
});

/**
 * Authentication rate limiter.
 * 5 requests per minute per IP (stricter for auth endpoints).
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 60_000, // 1 minute
  maxRequests: 5,
  keyGenerator: (req) =>
    `auth:${req.ip ?? req.socket.remoteAddress ?? "unknown"}`,
  message: "Too many authentication attempts. Please try again later.",
});

/**
 * Password reset rate limiter.
 * 3 requests per hour per IP.
 */
export const passwordResetRateLimiter = createRateLimiter({
  windowMs: 60 * 60_000, // 1 hour
  maxRequests: 3,
  keyGenerator: (req) =>
    `pwd-reset:${req.ip ?? req.socket.remoteAddress ?? "unknown"}`,
  message: "Too many password reset attempts. Please try again in an hour.",
});

/**
 * Webhook rate limiter.
 * 1000 requests per minute per source IP.
 */
export const webhookRateLimiter = createRateLimiter({
  windowMs: 60_000, // 1 minute
  maxRequests: 1000,
  keyGenerator: (req) =>
    `webhook:${req.ip ?? req.socket.remoteAddress ?? "unknown"}`,
});

/**
 * Payment operations rate limiter.
 * 10 requests per minute per user.
 */
export const paymentRateLimiter = createRateLimiter({
  windowMs: 60_000, // 1 minute
  maxRequests: 10,
  keyGenerator: (req) => {
    if (req.user) {
      return `payment:${req.user.userId.toString()}`;
    }
    return `payment:${req.ip ?? req.socket.remoteAddress ?? "unknown"}`;
  },
  message: "Too many payment requests. Please try again later.",
});
