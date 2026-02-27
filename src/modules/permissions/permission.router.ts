import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  authenticate,
  requireActiveOrganization,
  requirePermission,
} from "../../middleware/auth.ts";
import { rolePermissions } from "../roles/models/role.model.ts";

const permissionsRouter = Router();

/**
 * GET /api/v1/permissions
 * Returns the list of all available permissions.
 */
permissionsRouter.get(
  "/",
  authenticate,
  requireActiveOrganization,
  requirePermission("permissions:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    res.json({ status: "success", data: { permissions: rolePermissions } });
  },
);

export default permissionsRouter;
