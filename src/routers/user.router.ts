import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { userService } from "../modules/user/user.service.ts";
import { authService } from "../modules/auth/auth.service.ts";
import {
  UserZodSchema,
  UserUpdateZodSchema,
  userRoleOptions,
} from "../modules/user/models/user.model.ts";
import {
  validateBody,
  validateQuery,
  paginationSchema,
} from "../middleware/validation.ts";
import {
  authenticate,
  requireActiveOrganization,
  requirePermission,
  getOrgId,
  getUserId,
} from "../middleware/auth.ts";

const userRouter = Router();

// All routes require authentication and active organization
userRouter.use(authenticate, requireActiveOrganization);

/* ---------- Validation Schemas ---------- */

const listUsersQuerySchema = paginationSchema.extend({
  status: z.enum(["active", "inactive", "invited", "suspended"]).optional(),
  role: z.enum(userRoleOptions).optional(),
  search: z.string().optional(),
});

const inviteUserSchema = z.object({
  name: z.object({
    firstName: z.string().min(1).max(50),
    secondName: z.string().max(50).optional(),
    firstSurname: z.string().min(1).max(50),
    secondSurname: z.string().max(50).optional(),
  }),
  email: z.email(),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/),
  role: z.enum(userRoleOptions).default("commercial_advisor"),
});

const updateRoleSchema = z.object({
  role: z.enum(userRoleOptions),
});

/* ---------- Routes ---------- */

/**
 * GET /api/v1/users
 * Lists all users in the organization.
 */
userRouter.get(
  "/",
  requirePermission("users:read"),
  validateQuery(listUsersQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await userService.listByOrganization(
        getOrgId(req),
        req.query,
      );

      res.json({
        status: "success",
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/users/:id
 * Gets a specific user by ID.
 */
userRouter.get(
  "/:id",
  requirePermission("users:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await userService.findById(
        req.params.id as string,
        getOrgId(req),
      );

      res.json({
        status: "success",
        data: { user },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/users/invite
 * Invites a new user to the organization.
 */
userRouter.post(
  "/invite",
  requirePermission("users:create"),
  validateBody(inviteUserSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Generate a temporary password
      const temporaryPassword = Math.random().toString(36).slice(-12);

      const user = await authService.inviteUser(
        getOrgId(req),
        getUserId(req),
        req.body,
        temporaryPassword,
      );

      // In production, send invitation email with temporary password
      res.status(201).json({
        status: "success",
        data: {
          user: {
            id: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
            status: user.status,
          },
          // Only return temporary password in development
          ...(process.env.NODE_ENV !== "production" && { temporaryPassword }),
        },
        message:
          "User invited successfully. An invitation email has been sent.",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/users/:id
 * Updates a user's profile.
 */
userRouter.patch(
  "/:id",
  requirePermission("users:update"),
  validateBody(UserUpdateZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await userService.update(
        req.params.id as string,
        getOrgId(req),
        req.body,
      );

      res.json({
        status: "success",
        data: { user },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/users/:id/role
 * Updates a user's role (owner only).
 */
userRouter.patch(
  "/:id/role",
  requirePermission("users:update"),
  validateBody(updateRoleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await userService.updateRole(
        req.params.id as string,
        getOrgId(req),
        req.body.role,
        getUserId(req),
      );

      res.json({
        status: "success",
        data: { user },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/users/:id/deactivate
 * Deactivates a user account.
 */
userRouter.post(
  "/:id/deactivate",
  requirePermission("users:delete"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await userService.deactivate(
        req.params.id as string,
        getOrgId(req),
        getUserId(req),
      );

      res.json({
        status: "success",
        message: "User deactivated successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/users/:id/reactivate
 * Reactivates a user account.
 */
userRouter.post(
  "/:id/reactivate",
  requirePermission("users:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await userService.reactivate(req.params.id as string, getOrgId(req));

      res.json({
        status: "success",
        message: "User reactivated successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/users/:id
 * Permanently deletes a user.
 */
userRouter.delete(
  "/:id",
  requirePermission("users:delete"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await userService.delete(
        req.params.id as string,
        getOrgId(req),
        getUserId(req),
      );

      res.json({
        status: "success",
        message: "User deleted successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

export default userRouter;
