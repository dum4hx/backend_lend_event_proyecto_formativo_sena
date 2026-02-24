import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import rolesService from "./roles.service.ts";
import { RoleZodSchema } from "./models/role.model.ts";
import { validateBody, validateQuery, objectIdParamSchema, paginationSchema } from "../../middleware/validation.ts";
import { authenticate, requireActiveOrganization, requirePermission, getOrgId } from "../../middleware/auth.ts";

const router = Router();

router.use(authenticate, requireActiveOrganization);

const listQuerySchema = paginationSchema.extend({});

const createRoleSchema = RoleZodSchema.pick({ name: true, permissions: true, description: true });
const updateRoleSchema = z.object({ name: z.string().optional(), permissions: z.array(z.string()).optional(), description: z.string().max(500).trim().optional() });

router.get(
  "/",
  requirePermission("roles:read"),
  validateQuery(listQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await rolesService.listByOrganization(getOrgId(req), req.query as any);
      res.json({ status: "success", data: result });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/:id",
  requirePermission("roles:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role = await rolesService.findById(req.params.id as string, getOrgId(req));
      res.json({ status: "success", data: { role } });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/",
  requirePermission("roles:create"),
  validateBody(createRoleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role = await rolesService.create({ organizationId: getOrgId(req), ...req.body });
      res.status(201).json({ status: "success", data: { role } });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/:id",
  requirePermission("roles:update"),
  validateBody(updateRoleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role = await rolesService.update(req.params.id as string, getOrgId(req), req.body);
      res.json({ status: "success", data: { role } });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/:id",
  requirePermission("roles:delete"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await rolesService.delete(req.params.id as string, getOrgId(req));
      res.json({ status: "success", message: "Role deleted successfully" });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
