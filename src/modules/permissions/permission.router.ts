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
import { Permission } from "../roles/models/permissions.model.ts";

const permissionsRouter = Router();

/**
 * GET /api/v1/permissions
 * Returns all active, organization-assignable permissions from the database.
 *
 * Filters applied:
 *   - `isPlatformPermission: false`  → excludes super-admin-only capabilities
 *   - `isActive: true`               → excludes soft-disabled permissions
 *
 * Each permission is returned with its id, displayName, description and category
 * so the client can render a labelled, grouped permission picker.
 *
 * Access requires: authenticated user + active organization + `permissions:read`.
 */
permissionsRouter.get(
  "/",
  authenticate,
  requireActiveOrganization,
  requirePermission("permissions:read"),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const permissions = await Permission.find(
        { isPlatformPermission: false, isActive: true },
        { _id: 1, displayName: 1, description: 1, category: 1 },
      )
        .sort({ category: 1, _id: 1 })
        .lean();

      res.json({ status: "success", data: { permissions } });
    } catch (err) {
      next(err);
    }
  },
);

export default permissionsRouter;
