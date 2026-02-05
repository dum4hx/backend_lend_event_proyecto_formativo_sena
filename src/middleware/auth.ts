import type { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { verifyAccessToken, type JWTPayload } from "../utils/auth/jwt.ts";
import { AppError } from "../errors/AppError.ts";
import {
  rolePermissions,
  type UserRole,
} from "../modules/user/models/user.model.ts";
import { Organization } from "../modules/organization/models/organization.model.ts";

/* ---------- Extend Express Request ---------- */

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export interface AuthenticatedUser {
  id: string;
  userId: Types.ObjectId;
  organizationId: Types.ObjectId;
  role: UserRole;
  email: string;
}

/* ---------- Helper Functions ---------- */

/**
 * Gets the authenticated user from the request.
 * Throws if no user is attached (use after authenticate middleware).
 */
export function getAuthUser(req: Request): AuthenticatedUser {
  if (!req.user) {
    throw AppError.unauthorized("Authentication required");
  }
  return req.user;
}

/* ---------- Cookie Configuration ---------- */

const COOKIE_NAME = "access_token";
const REFRESH_COOKIE_NAME = "refresh_token";

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  domain: process.env.COOKIE_DOMAIN ?? undefined,
  path: "/",
};

export const accessTokenCookieOptions = {
  ...cookieOptions,
  maxAge: 15 * 60 * 1000, // 15 minutes
};

export const refreshTokenCookieOptions = {
  ...cookieOptions,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/api/v1/auth", // Only sent to auth endpoints
};

/* ---------- Authentication Middleware ---------- */

/**
 * Middleware that verifies JWT from HTTP-only cookie.
 * Attaches user info to req.user if valid.
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Extract token from cookie
    const token = req.cookies?.[COOKIE_NAME] as string | undefined;

    if (!token) {
      throw AppError.unauthorized("Authentication required");
    }

    // Verify the token
    const payload: JWTPayload = await verifyAccessToken(token);

    // Attach user info to request
    req.user = {
      id: payload.sub,
      userId: new Types.ObjectId(payload.sub),
      organizationId: new Types.ObjectId(payload.org),
      role: payload.role,
      email: payload.email,
    };

    next();
  } catch (err: unknown) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    next(AppError.unauthorized("Invalid or expired token"));
  }
};

/* ---------- Organization Scoping Middleware ---------- */

/**
 * Middleware that ensures the organization is active and accessible.
 * Must be used after authenticate middleware.
 */
export const requireActiveOrganization = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) {
      throw AppError.unauthorized("Authentication required");
    }

    const organization = await Organization.findById(
      req.user.organizationId,
    ).select("status");

    if (!organization) {
      throw AppError.notFound("Organization not found");
    }

    if (organization.status === "suspended") {
      throw AppError.unauthorized(
        "Organization is suspended. Please contact support or update payment information.",
        { code: "ORGANIZATION_SUSPENDED" },
      );
    }

    if (organization.status === "cancelled") {
      throw AppError.unauthorized(
        "Organization subscription has been cancelled.",
        { code: "ORGANIZATION_CANCELLED" },
      );
    }

    next();
  } catch (err: unknown) {
    next(err);
  }
};

/* ---------- Authorization Middleware ---------- */

/**
 * Creates middleware that checks if user has required permission.
 */
export const requirePermission = (...permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw AppError.unauthorized("Authentication required");
      }

      const userPermissions = rolePermissions[req.user.role] ?? [];
      const hasPermission = permissions.some((perm) =>
        userPermissions.includes(perm),
      );

      if (!hasPermission) {
        throw AppError.unauthorized(
          "You do not have permission to perform this action",
          { code: "FORBIDDEN", requiredPermissions: permissions },
        );
      }

      next();
    } catch (err: unknown) {
      next(err);
    }
  };
};

/**
 * Creates middleware that checks if user has one of the specified roles.
 */
export const requireRole = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw AppError.unauthorized("Authentication required");
      }

      if (!roles.includes(req.user.role)) {
        throw AppError.unauthorized(
          "You do not have the required role to perform this action",
          { code: "FORBIDDEN", requiredRoles: roles },
        );
      }

      next();
    } catch (err: unknown) {
      next(err);
    }
  };
};

/**
 * Middleware that restricts access to organization owners only.
 */
export const requireOwner = requireRole("owner");

/**
 * Middleware that restricts access to managers and above.
 */
export const requireManager = requireRole("owner", "manager");

/* ---------- Resource Ownership Middleware ---------- */

/**
 * Creates middleware that validates organization scoping for a resource.
 * Ensures the requested resource belongs to the user's organization.
 */
export const validateOrgScope = (
  getOrgIdFromRequest: (req: Request) => string | undefined,
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw AppError.unauthorized("Authentication required");
      }

      const resourceOrgId = getOrgIdFromRequest(req);

      // Skip validation if no org ID in request (e.g., creation endpoints)
      if (!resourceOrgId) {
        next();
        return;
      }

      if (resourceOrgId !== req.user.organizationId.toString()) {
        throw AppError.notFound("Resource not found");
      }

      next();
    } catch (err: unknown) {
      next(err);
    }
  };
};

/* ---------- Utility Functions ---------- */

/**
 * Extracts organization ID from request user context.
 * Throws if not authenticated.
 */
export const getOrgId = (req: Request): Types.ObjectId => {
  if (!req.user) {
    throw AppError.unauthorized("Authentication required");
  }
  return req.user.organizationId;
};

/**
 * Extracts user ID from request user context.
 * Throws if not authenticated.
 */
export const getUserId = (req: Request): Types.ObjectId => {
  if (!req.user) {
    throw AppError.unauthorized("Authentication required");
  }
  return req.user.userId;
};

export { COOKIE_NAME, REFRESH_COOKIE_NAME };
