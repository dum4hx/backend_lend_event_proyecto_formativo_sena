import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { authService } from "../modules/auth/auth.service.ts";
import { UserZodSchema } from "../modules/user/models/user.model.ts";
import { OrganizationZodSchema } from "../modules/organization/models/organization.model.ts";
import { validateBody } from "../middleware/validation.ts";
import { authRateLimiter } from "../middleware/rate_limiter.ts";
import {
  authenticate,
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
} from "../middleware/auth.ts";
import { verifyRefreshToken } from "../utils/auth/jwt.ts";
import { AppError } from "../errors/AppError.ts";
import { access } from "node:fs";

const authRouter = Router();

/* ---------- Validation Schemas ---------- */

const registerSchema = z.object({
  organization: OrganizationZodSchema.omit({ ownerId: true }),
  owner: UserZodSchema.omit({ organizationId: true, role: true }),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

/* ---------- Routes ---------- */

/**
 * POST /api/v1/auth/register
 * Registers a new organization with owner account.
 */
authRouter.post(
  "/register",
  authRateLimiter,
  validateBody(registerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organization, owner } = req.body;

      const result = await authService.register(organization, owner);

      // Set cookies
      res.cookie(
        COOKIE_NAME,
        result.tokens.accessToken,
        accessTokenCookieOptions,
      );
      res.cookie(
        REFRESH_COOKIE_NAME,
        result.tokens.refreshToken,
        refreshTokenCookieOptions,
      );

      res.status(201).json({
        status: "success",
        data: {
          organization: {
            id: result.organization._id,
            name: result.organization.name,
            email: result.organization.email,
          },
          user: {
            id: result.user._id,
            email: result.user.email,
            name: result.user.name,
            role: result.user.role,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/login
 * Authenticates user and sets JWT cookies.
 */
authRouter.post(
  "/login",
  authRateLimiter,
  validateBody(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;

      const result = await authService.login(email, password);

      // Set cookies
      res.cookie(
        COOKIE_NAME,
        result.tokens.accessToken,
        accessTokenCookieOptions,
      );
      res.cookie(
        REFRESH_COOKIE_NAME,
        result.tokens.refreshToken,
        refreshTokenCookieOptions,
      );

      res.json({
        status: "success",
        data: {
          user: {
            id: result.user._id,
            email: result.user.email,
            name: result.user.name,
            role: result.user.role,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/refresh
 * Refreshes access token using refresh token cookie.
 */
authRouter.post(
  "/refresh",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

      if (!refreshToken) {
        throw AppError.unauthorized("Refresh token required");
      }

      const payload = await verifyRefreshToken(refreshToken);
      const tokens = await authService.refreshTokens(payload.sub, payload.org);

      // Set new cookies
      res.cookie(COOKIE_NAME, tokens.accessToken, accessTokenCookieOptions);
      res.cookie(
        REFRESH_COOKIE_NAME,
        tokens.refreshToken,
        refreshTokenCookieOptions,
      );

      res.json({
        status: "success",
        message: "Tokens refreshed",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/logout
 * Clears authentication cookies.
 */
authRouter.post("/logout", (req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/v1/auth" });

  res.json({
    status: "success",
    message: "Logged out successfully",
  });
});

/**
 * POST /api/v1/auth/change-password
 * Changes the authenticated user's password.
 */
authRouter.post(
  "/change-password",
  authenticate,
  validateBody(changePasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { currentPassword, newPassword } = req.body;

      await authService.changePassword(
        req.user!.userId,
        currentPassword,
        newPassword,
      );

      res.json({
        status: "success",
        message: "Password changed successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/auth/me
 * Returns the current authenticated user's info.
 */
authRouter.get(
  "/me",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userService } = await import("../modules/user/user.service.ts");
      const user = await userService.getProfile(req.user!.userId);

      res.json({
        status: "success",
        data: { user },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default authRouter;
