export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR"
  // allow extension without refactors
  | string;

export interface AppErrorOptions {
  message: string;
  statusCode?: number;
  code?: ErrorCode;
  isOperational?: boolean;
  details?: unknown;
  cause?: unknown;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly isOperational: boolean;
  public readonly details?: unknown;
  public readonly cause?: unknown;

  constructor({
    message,
    statusCode = 500,
    code = "INTERNAL_ERROR",
    isOperational = true,
    details,
    cause,
  }: AppErrorOptions) {
    super(message, { cause });

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    this.cause = cause;

    Error.captureStackTrace?.(this, this.constructor);
  }

  /* ---------- Factory helpers ---------- */

  static badRequest(message = "Bad Request", details?: unknown): AppError {
    return new AppError({
      message,
      statusCode: 400,
      code: "BAD_REQUEST",
      details,
    });
  }

  static unauthorized(message = "Unauthorized", details?: unknown): AppError {
    return new AppError({
      message,
      statusCode: 401,
      code: "UNAUTHORIZED",
      details,
    });
  }

  static notFound(message = "Not Found", details?: unknown): AppError {
    return new AppError({
      message,
      statusCode: 404,
      code: "NOT_FOUND",
      details,
    });
  }

  static conflict(message = "Conflict", details?: unknown): AppError {
    return new AppError({
      message,
      statusCode: 409,
      code: "CONFLICT",
      details,
    });
  }

  static internal(
    message = "Internal Server Error",
    cause?: unknown,
  ): AppError {
    return new AppError({
      message,
      statusCode: 500,
      code: "INTERNAL_ERROR",
      isOperational: false,
      cause,
    });
  }
}
