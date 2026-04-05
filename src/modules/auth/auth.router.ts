import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { authService } from "./auth.service.ts";
import { UserZodSchema } from "../user/models/user.model.ts";
import {
  OrganizationZodSchema,
  Organization,
} from "../organization/models/organization.model.ts";
import { validateBody } from "../../middleware/validation.ts";
import {
  authRateLimiter,
  passwordResetRateLimiter,
} from "../../middleware/rate_limiter.ts";
import {
  authenticate,
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
} from "../../middleware/auth.ts";
import { verifyRefreshToken } from "../../utils/auth/jwt.ts";
import { AppError } from "../../errors/AppError.ts";
import { twoFactorService } from "./two_factor.service.ts";

const authRouter = Router();

/* ---------- Validation Schemas ---------- */

const registerSchema = z.object({
  organization: OrganizationZodSchema.omit({ ownerId: true }),
  owner: UserZodSchema.omit({
    organizationId: true,
    roleId: true,
    locations: true,
  }),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must not exceed 128 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one digit")
    .regex(
      /[^A-Za-z0-9]/,
      "Password must contain at least one special character",
    ),
});

const passwordValidation = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must not exceed 128 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one digit")
  .regex(
    /[^A-Za-z0-9]/,
    "Password must contain at least one special character",
  );

const forgotPasswordSchema = z.object({
  email: z.email("Invalid email format"),
});

const verifyResetCodeSchema = z.object({
  email: z.email("Invalid email format"),
  code: z
    .string()
    .length(6, "Verification code must be 6 digits")
    .regex(/^\d{6}$/, "Verification code must be numeric"),
});

const resetPasswordSchema = z.object({
  email: z.email("Invalid email format"),
  resetToken: z.string().min(1, "Reset token is required"),
  newPassword: passwordValidation,
});

const acceptInviteSchema = z.object({
  email: z.email("Invalid email format"),
  token: z.string().min(1, "Invite token is required"),
  password: passwordValidation,
});

const verifyEmailSchema = z.object({
  email: z.email("Invalid email format"),
  code: z
    .string()
    .length(6, "Verification code must be 6 digits")
    .regex(/^\d{6}$/, "Verification code must be numeric"),
});

const verifyLoginOtpSchema = z.object({
  email: z.email("Invalid email format"),
  code: z
    .string()
    .length(6, "Verification code must be 6 digits")
    .regex(/^\d{6}$/, "Verification code must be numeric"),
});

const verifyBackupCodeSchema = z.object({
  email: z.email("Invalid email format"),
  backupCode: z.string().min(1, "Backup code is required"),
});

const resendLoginOtpSchema = z.object({
  email: z.email("Invalid email format"),
  password: z.string().min(1),
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

      res.status(202).json({
        status: "success",
        message:
          "Registration successful. Please check your email for a 6-digit verification code to activate your account.",
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
            locations: result.user.locations,
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
 * Authenticates user with email/password and sends a 2FA OTP to their email.
 * Does NOT issue auth tokens — the client must verify the OTP first.
 */
authRouter.post(
  "/login",
  authRateLimiter,
  validateBody(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;

      const result = await authService.login(email, password);

      res.json({
        status: "success",
        data: {
          pendingOtp: result.pendingOtp,
          email: result.email,
        },
        message: result.message,
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
  res.clearCookie(COOKIE_NAME, accessTokenCookieOptions);
  res.clearCookie(REFRESH_COOKIE_NAME, refreshTokenCookieOptions);

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
      const { userService } = await import("../user/user.service.ts");
      const profile = await userService.getProfile(req.user!.userId);

      res.json({
        status: "success",
        data: {
          user: {
            ...profile.user.toObject(),
            roleName: req.user!.roleName,
            permissions: profile.permissions,
          },
          permissions: profile.permissions,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/auth/payment-status
 * Checks if the authenticated user (owner) has an active paid subscription.
 */
authRouter.get(
  "/payment-status",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userService } = await import("../user/user.service.ts");
      const profile = await userService.getProfile(req.user!.userId);

      // Check if subscription is active and paid
      const organizationStatusData = await authService.isActiveOrganization(
        req.user!.userId,
      );

      res.json({
        status: "success",
        data: {
          isActive: organizationStatusData.isActive,
          plan: organizationStatusData.subscription?.plan || "free",
          organizationStatus: organizationStatusData.status,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/forgot-password
 * Sends a 6-digit verification code to the user's email.
 */
authRouter.post(
  "/forgot-password",
  passwordResetRateLimiter,
  validateBody(forgotPasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;

      await authService.forgotPassword(email);

      // Always return success to prevent email enumeration
      res.json({
        status: "success",
        message:
          "If an account with that email exists, a verification code has been sent.",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/verify-reset-code
 * Verifies the OTP code and returns a reset token.
 */
authRouter.post(
  "/verify-reset-code",
  passwordResetRateLimiter,
  validateBody(verifyResetCodeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, code } = req.body;

      const result = await authService.verifyResetCode(email, code);

      res.json({
        status: "success",
        data: {
          resetToken: result.resetToken,
        },
        message:
          "Code verified successfully. Use the reset token to set a new password.",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/reset-password
 * Resets the password using a verified reset token.
 */
authRouter.post(
  "/reset-password",
  passwordResetRateLimiter,
  validateBody(resetPasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, resetToken, newPassword } = req.body;

      await authService.resetPassword(email, resetToken, newPassword);

      res.json({
        status: "success",
        message:
          "Password has been reset successfully. You can now log in with your new password.",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/accept-invite
 * Accepts an organization invite using a token from the invitation email.
 * Sets the user's password and activates the account.
 */
authRouter.post(
  "/accept-invite",
  authRateLimiter,
  validateBody(acceptInviteSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, token, password } = req.body;

      const user = await authService.acceptInvite(email, token, password);

      res.json({
        status: "success",
        data: {
          user: {
            id: user._id,
            email: user.email,
            name: user.name,
            roleId: user.roleId,
            status: user.status,
          },
        },
        message:
          "Account activated successfully. You can now log in with your password.",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/verify-email
 * Verifies the 6-digit OTP sent to the owner's email during registration.
 * On success sets auth cookies and returns the full account profile.
 */
authRouter.post(
  "/verify-email",
  authRateLimiter,
  validateBody(verifyEmailSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, code } = req.body;

      const result = await authService.verifyEmail(email, code);

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
        message: "Email verified successfully. Your account is now active.",
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
            roleId: result.user.roleId,
            roleName: result.roleName,
            locations: result.user.locations,
            permissions: result.permissions,
          },
          permissions: result.permissions,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/verify-login-otp
 * Verifies the 6-digit OTP sent to the user's email during login.
 * On success, issues auth cookies and returns the full profile.
 * On first login, also returns one-time backup codes.
 */
authRouter.post(
  "/verify-login-otp",
  authRateLimiter,
  validateBody(verifyLoginOtpSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, code } = req.body;

      const { userId } = await twoFactorService.verifyLoginOtp(email, code);
      const result = await authService.completeLogin(userId);

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

      const responseData: Record<string, unknown> = {
        user: {
          id: result.user._id,
          email: result.user.email,
          name: result.user.name,
          roleId: result.user.roleId,
          roleName: result.roleName,
          locations: result.user.locations,
          permissions: result.permissions,
        },
        permissions: result.permissions,
      };

      // Include backup codes only on first 2FA login
      if (result.backupCodes) {
        responseData.backupCodes = result.backupCodes;
      }

      res.json({
        status: "success",
        data: responseData,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/verify-backup-code
 * Authenticates using a one-time backup code instead of OTP.
 * Useful when the user cannot access their email.
 */
authRouter.post(
  "/verify-backup-code",
  authRateLimiter,
  validateBody(verifyBackupCodeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, backupCode } = req.body;

      const { userId } = await twoFactorService.verifyBackupCode(
        email,
        backupCode,
      );
      const result = await authService.completeLogin(userId);

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

      const remainingCodes =
        await twoFactorService.getRemainingBackupCodeCount(userId);

      res.json({
        status: "success",
        data: {
          user: {
            id: result.user._id,
            email: result.user.email,
            name: result.user.name,
            roleId: result.user.roleId,
            roleName: result.roleName,
            locations: result.user.locations,
            permissions: result.permissions,
          },
          permissions: result.permissions,
          remainingBackupCodes: remainingCodes,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/resend-login-otp
 * Re-authenticates with email/password and sends a fresh login OTP.
 * Requires the same credentials to prevent abuse.
 */
authRouter.post(
  "/resend-login-otp",
  authRateLimiter,
  validateBody(resendLoginOtpSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;

      // Re-validate credentials (prevents enumeration / abuse)
      await authService.login(email, password);

      res.json({
        status: "success",
        message:
          "A new verification code has been sent to your email.",
      });
    } catch (err) {
      next(err);
    }
  },
);

export default authRouter;
