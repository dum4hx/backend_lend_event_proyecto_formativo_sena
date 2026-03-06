import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import rolesService from "./roles.service.ts";
import { RoleZodSchema } from "./models/role.model.ts";
import { super_admin_only_permsissions } from "./models/role.model.ts";
import {
  validateBody,
  validateQuery,
  objectIdParamSchema,
  paginationSchema,
} from "../../middleware/validation.ts";
import {
  authenticate,
  requireActiveOrganization,
  requirePermission,
} from "../../middleware/auth.ts";

/* ---------- Roles Router ---------- */
/**
 * HTTPS routes for role management (CRUD).
 * All routes are scoped to the currently active organization and
 * require an authenticated user. Business logic is delegated to
 * `rolesService`; router handlers should stay minimal and only
 * handle request/response concerns.
 */
const router = Router();

// Apply authentication and active-organization middleware to all routes
router.use(authenticate, requireActiveOrganization);

/* ---------- Validation Schemas ---------- */
const listQuerySchema = paginationSchema.extend({});

const SUPER_ADMIN_PERMS_SET = new Set<string>(super_admin_only_permsissions);

const createRoleSchema = RoleZodSchema.pick({
  name: true,
  permissions: true,
  description: true,
})
  .extend({
    // Normalize to lowercase so "Owner" and "OWNER" are treated as the same name
    name: z.string().min(3).max(50).trim().transform((v) => v.toLowerCase()),
  })
  .refine(
  (data) => !data.permissions?.some((p) => SUPER_ADMIN_PERMS_SET.has(p)),
  {
    message:
      "One or more permissions are restricted to the platform super-admin",
    path: ["permissions"],
  },
);

const updateRoleSchema = z
  .object({
    // Normalize to lowercase so case variants of the same name are rejected as duplicates
    name: z
      .string()
      .min(3)
      .max(50)
      .trim()
      .transform((v) => v.toLowerCase())
      .optional(),
    permissions: z.array(z.string()).optional(),
    description: z.string().max(500).trim().optional(),
  })
  .refine((data) => data.name !== "super_admin", {
    message:
      "The 'super_admin' role is platform-only and cannot be assigned to an organization",
    path: ["name"],
  })
  .refine(
    (data) => !data.permissions?.some((p) => SUPER_ADMIN_PERMS_SET.has(p)),
    {
      message:
        "One or more permissions are restricted to the platform super-admin",
      path: ["permissions"],
    },
  );

/**
 * GET api/v1/roles/
 * List roles for the current organization. Supports pagination and sorting.
 */
router.get(
  "/",
  requirePermission("roles:read"),
  validateQuery(listQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await rolesService.listFromRequest(req);
      res.json({ status: "success", data: result });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET api/v1/roles/:id
 * Get details for a single role within the organization.
 */
router.get(
  "/:id",
  requirePermission("roles:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role = await rolesService.findByIdFromRequest(req);
      res.json({ status: "success", data: { role } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST api/v1/roles/
 * Create a new role for the current organization.
 */
router.post(
  "/",
  requirePermission("roles:create"),
  validateBody(createRoleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role = await rolesService.createFromRequest(req);
      res.status(201).json({ status: "success", data: { role } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH api/v1/roles/:id
 * Update an existing role. Only provided fields are updated.
 */
router.patch(
  "/:id",
  requirePermission("roles:update"),
  validateBody(updateRoleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role = await rolesService.updateFromRequest(req);
      res.json({ status: "success", data: { role } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE api/v1/roles/:id
 * Delete a role belonging to the current organization.
 */
router.delete(
  "/:id",
  requirePermission("roles:delete"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await rolesService.deleteFromRequest(req);
      res.json({ status: "success", message: "Role deleted successfully" });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
