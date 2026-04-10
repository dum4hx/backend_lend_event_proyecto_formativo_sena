import type { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { verifyAccessToken, type JWTPayload } from "../utils/auth/jwt.ts";
import { AppError } from "../errors/AppError.ts";
import {
  Role,
  rolePermissions,
  type UserRole,
} from "../modules/roles/models/role.model.ts";
import { Organization } from "../modules/organization/models/organization.model.ts";
import { User } from "../modules/user/models/user.model.ts";

/* ---------- Extend Express Request ---------- */

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      correlationId?: string;
    }
  }
}

export interface AuthenticatedUser {
  id: string;
  userId: Types.ObjectId;
  organizationId: Types.ObjectId;
  roleId: Types.ObjectId;
  /** Role name as embedded in the JWT at mint-time — no extra DB query needed. */
  roleName: string;
  email: string;
}

/* ---------- Helper Functions ---------- */

/**
 * Gets the authenticated user from the request.
 * Throws if no user is attached (use after authenticate middleware).
 */
export function getAuthUser(req: Request): AuthenticatedUser {
  if (!req.user) {
    throw AppError.unauthorized("Autenticación requerida");
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
      throw AppError.unauthorized("Autenticación requerida");
    }

    // Verify the token
    const payload: JWTPayload = await verifyAccessToken(token);

    // Validate payload structure — `roleId` is the JWT claim name (matches JWTPayload interface)
    if (!payload.sub || !payload.org || !payload.roleId || !payload.email) {
      throw AppError.unauthorized("Estructura del payload del token no válida");
    }

    // Validate ObjectId formats
    if (!Types.ObjectId.isValid(payload.sub)) {
      throw AppError.unauthorized("ID de usuario no válido en el token");
    }
    if (!Types.ObjectId.isValid(payload.org)) {
      throw AppError.unauthorized("ID de organización no válido en el token");
    }
    if (!Types.ObjectId.isValid(payload.roleId)) {
      throw AppError.unauthorized("ID de rol no válido en el token");
    }

    // Attach user info to request — roleName comes for free from the token payload
    req.user = {
      id: payload.sub,
      userId: new Types.ObjectId(payload.sub),
      organizationId: new Types.ObjectId(payload.org),
      roleId: new Types.ObjectId(payload.roleId),
      roleName: payload.roleName ?? "",
      email: payload.email,
    };

    // Prevent intermediary/proxy/browser caching of authenticated responses.
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    // Inject organizationId into request body for downstream validators
    // Some route validators expect `organizationId` in the body (e.g. POST /materials/types).
    // The organization should come from the token, not the client — set it here so zod
    // validation that requires organizationId will succeed.
    try {
      if (!req.body) {
        // ensure body exists
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        req.body = {};
      }

      if (!req.body.organizationId) {
        Object.defineProperty(req.body, "organizationId", {
          value: req.user.organizationId.toString(),
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
    } catch (_err) {
      // Non-critical: if injection fails, validation will surface the error.
    }

    next();
  } catch (err: unknown) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    next(AppError.unauthorized("Token no válido o expirado"));
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
      throw AppError.unauthorized("Autenticación requerida");
    }

    const organization = await Organization.findById(
      req.user.organizationId,
    ).select("status");

    if (!organization) {
      throw AppError.notFound("Organización no encontrada");
    }

    if (organization.status === "suspended") {
      throw AppError.unauthorized(
        "La organización está suspendida. Por favor, contacte soporte o actualice la información de pago.",
        { code: "ORGANIZATION_SUSPENDED" },
      );
    }

    if (organization.status === "cancelled") {
      throw AppError.unauthorized(
        "La suscripción de la organización ha sido cancelada.",
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
 * Helper function to check if user has required permissions.
 * Used by requirePermission middleware.
 */
export const hasPermissions = async (
  user: AuthenticatedUser,
  permissions: string[],
): Promise<boolean> => {
  const userDoc = await User.findById(user.userId).select("roleId");
  if (!userDoc) {
    return false;
  }
  return userDoc.hasPermissions(permissions);
};

/**
 * Creates middleware that checks if user has required permission.
 */
export const requirePermission = (...permissions: string[]) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw AppError.unauthorized("Autenticación requerida");
      }

      const hasPermission = await hasPermissions(req.user, permissions);
      if (!hasPermission) {
        throw AppError.unauthorized(
          "No tienes permiso para realizar esta acción",
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
 * @deprecated Use requirePermission instead for more flexible permission-based access control. Role-based checks require an extra DB query to get the user's role and are less flexible than permission-based checks.
 */
export const requireRole = (...roleIds: String[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw AppError.unauthorized("Autenticación requerida");
      }
      // TODO: Remove ID based role checks in favor of permission-based checks. This is less flexible and requires an extra DB query to get the user's role ID.
      // Get role name for comparison
      if (!roleIds.includes(req.user.roleId.toString())) {
        throw AppError.unauthorized(
          "No tienes el rol requerido para realizar esta acción",
          { code: "FORBIDDEN", requiredRoles: roleIds },
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
 * Middleware that restricts access to super admins only.
 *
 * Checks `roleName` from the JWT payload instead of `roleId`, because the
 * super admin's roleId is a real MongoDB ObjectId (pointing to the
 * super_admin Role document seeded for the platform organisation) — not the
 * literal string "super_admin".
 */
export const requireSuperAdmin = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  try {
    if (!req.user) {
      throw AppError.unauthorized("Autenticación requerida");
    }
    if (req.user.roleName !== "super_admin") {
      throw AppError.unauthorized(
        "No tienes el rol requerido para realizar esta acción",
        { code: "FORBIDDEN", requiredRoles: ["super_admin"] },
      );
    }
    next();
  } catch (err: unknown) {
    next(err);
  }
};

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
        throw AppError.unauthorized("Autenticación requerida");
      }

      const resourceOrgId = getOrgIdFromRequest(req);

      // Skip validation if no org ID in request (e.g., creation endpoints)
      if (!resourceOrgId) {
        next();
        return;
      }

      if (resourceOrgId !== req.user.organizationId.toString()) {
        throw AppError.notFound("Recurso no encontrado");
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
    throw AppError.unauthorized("Autenticación requerida");
  }
  return req.user.organizationId;
};

/**
 * Extracts user ID from request user context.
 * Throws if not authenticated.
 */
export const getUserId = (req: Request): Types.ObjectId => {
  if (!req.user) {
    throw AppError.unauthorized("Autenticación requerida");
  }
  return req.user.userId;
};

export { COOKIE_NAME, REFRESH_COOKIE_NAME };
