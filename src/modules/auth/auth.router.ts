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

// Prevent browser/proxy caching for auth responses.
authRouter.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

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
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(128, "La contraseña no debe exceder los 128 caracteres")
    .regex(/[A-Z]/, "La contraseña debe contener al menos una letra mayúscula")
    .regex(/[a-z]/, "La contraseña debe contener al menos una letra minúscula")
    .regex(/[0-9]/, "La contraseña debe contener al menos un dígito")
    .regex(
      /[^A-Za-z0-9]/,
      "La contraseña debe contener al menos un carácter especial",
    ),
});

const passwordValidation = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(128, "La contraseña no debe exceder los 128 caracteres")
  .regex(/[A-Z]/, "La contraseña debe contener al menos una letra mayúscula")
  .regex(/[a-z]/, "La contraseña debe contener al menos una letra minúscula")
  .regex(/[0-9]/, "La contraseña debe contener al menos un dígito")
  .regex(
    /[^A-Za-z0-9]/,
    "La contraseña debe contener al menos un carácter especial",
  );

const forgotPasswordSchema = z.object({
  email: z.email("Formato de correo electrónico no válido"),
});

const verifyResetCodeSchema = z.object({
  email: z.email("Formato de correo electrónico no válido"),
  code: z
    .string()
    .length(6, "El código de verificación debe tener 6 dígitos")
    .regex(/^\d{6}$/, "El código de verificación debe ser numérico"),
});

const resetPasswordSchema = z.object({
  email: z.email("Formato de correo electrónico no válido"),
  resetToken: z.string().min(1, "El token de restablecimiento es requerido"),
  newPassword: passwordValidation,
});

const acceptInviteSchema = z.object({
  email: z.email("Formato de correo electrónico no válido"),
  token: z.string().min(1, "El token de invitación es requerido"),
  password: passwordValidation,
});

const verifyEmailSchema = z.object({
  email: z.email("Formato de correo electrónico no válido"),
  code: z
    .string()
    .length(6, "El código de verificación debe tener 6 dígitos")
    .regex(/^\d{6}$/, "El código de verificación debe ser numérico"),
});

const verifyLoginOtpSchema = z.object({
  email: z.email("Formato de correo electrónico no válido"),
  code: z
    .string()
    .length(6, "El código de verificación debe tener 6 dígitos")
    .regex(/^\d{6}$/, "El código de verificación debe ser numérico"),
});

const verifyBackupCodeSchema = z.object({
  email: z.email("Formato de correo electrónico no válido"),
  backupCode: z.string().min(1, "El código de respaldo es requerido"),
});

const resendLoginOtpSchema = z.object({
  email: z.email("Formato de correo electrónico no válido"),
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
          "Registro exitoso. Por favor revisa tu correo electrónico para obtener el código de verificación de 6 dígitos y activar tu cuenta.",
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
        throw AppError.unauthorized("Token de actualización requerido");
      }

      const payload = await verifyRefreshToken(refreshToken);
      const tokens = await authService.refreshTokens(
        payload.sub,
        payload.org,
        refreshToken,
      );

      // Set new cookies
      res.cookie(COOKIE_NAME, tokens.accessToken, accessTokenCookieOptions);
      res.cookie(
        REFRESH_COOKIE_NAME,
        tokens.refreshToken,
        refreshTokenCookieOptions,
      );

      res.json({
        status: "success",
        message: "Tokens actualizados",
      });
    } catch (err) {
      // If refresh fails, force a clean browser auth state.
      res.clearCookie(COOKIE_NAME, accessTokenCookieOptions);
      res.clearCookie(REFRESH_COOKIE_NAME, refreshTokenCookieOptions);
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/logout
 * Revokes current refresh session and clears authentication cookies.
 */
authRouter.post(
  "/logout",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] as
        | string
        | undefined;

      if (refreshToken) {
        await authService.revokeRefreshSession(refreshToken);
      }

      res.clearCookie(COOKIE_NAME, accessTokenCookieOptions);
      res.clearCookie(REFRESH_COOKIE_NAME, refreshTokenCookieOptions);

      res.json({
        status: "success",
        message: "Sesión cerrada exitosamente",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/logout-all
 * Revokes every active refresh session for the authenticated user.
 */
authRouter.post(
  "/logout-all",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.revokeAllRefreshSessions(req.user!.userId);

      res.clearCookie(COOKIE_NAME, accessTokenCookieOptions);
      res.clearCookie(REFRESH_COOKIE_NAME, refreshTokenCookieOptions);

      res.json({
        status: "success",
        message: "Todas las sesiones activas fueron cerradas exitosamente",
      });
    } catch (err) {
      next(err);
    }
  },
);

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
        message: "Contraseña cambiada exitosamente",
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
          "Si existe una cuenta con ese correo electrónico, se ha enviado un código de verificación.",
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
          "Código verificado exitosamente. Usa el token de restablecimiento para establecer una nueva contraseña.",
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
          "La contraseña se ha restablecido exitosamente. Ahora puedes iniciar sesión con tu nueva contraseña.",
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
          "Cuenta activada exitosamente. Ahora puedes iniciar sesión con tu contraseña.",
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
        message:
          "Correo electrónico verificado exitosamente. Tu cuenta está ahora activa.",
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
          "Se ha enviado un nuevo código de verificación a tu correo electrónico.",
      });
    } catch (err) {
      next(err);
    }
  },
);

export default authRouter;
