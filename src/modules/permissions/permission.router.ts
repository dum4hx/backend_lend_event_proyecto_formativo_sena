import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { createRequire } from "module";
import {
  authenticate,
  requireActiveOrganization,
  requirePermission,
} from "../../middleware/auth.ts";
import { validateQuery } from "../../middleware/validation.ts";

// Load the permissions catalogue from the canonical JSON source at startup.
// This avoids a DB round-trip on every request and guarantees the response
// always reflects the current codebase definition.
const require = createRequire(import.meta.url);
const ALL_PERMISSIONS: Array<{
  _id: string;
  displayName: string;
  description: string;
  category: string;
  isPlatformPermission: boolean;
}> = require("../roles/seeders/permissions.json");

const permissionsRouter = Router();

const listPermissionsQuerySchema = z.object({
  /** Filter to a specific category (case-sensitive, e.g. "Transfers") */
  category: z.string().optional(),
  /**
   * When "true", platform-only permissions are included.
   * Intended for super-admin tooling; regular org users never need these.
   */
  includePlatform: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  /** When "true", returns permissions grouped by category instead of a flat list */
  grouped: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

/**
 * GET /api/v1/permissions
 *
 * Returns the system's permission catalogue sourced directly from
 * permissions.json (the authoritative definitions file).
 *
 * Query params:
 *   - category        — filter to a single category
 *   - includePlatform — include platform-only permissions (default: false)
 *   - grouped         — group results by category (default: false)
 *
 * Access requires: authenticated user + active organization + `permissions:read`.
 */
permissionsRouter.get(
  "/",
  authenticate,
  requireActiveOrganization,
  requirePermission("permissions:read"),
  validateQuery(listPermissionsQuerySchema),
  (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { category, includePlatform, grouped } = (_req as any).query as {
        category?: string;
        includePlatform: boolean;
        grouped: boolean;
      };

      let permissions = ALL_PERMISSIONS;

      // Exclude platform permissions unless explicitly requested
      if (!includePlatform) {
        permissions = permissions.filter((p) => !p.isPlatformPermission);
      }

      // Optionally filter to a single category
      if (category) {
        permissions = permissions.filter((p) => p.category === category);
      }

      // Shape each entry to a clean DTO
      const dto = permissions.map((p) => ({
        id: p._id,
        displayName: p.displayName,
        description: p.description,
        category: p.category,
        isPlatformPermission: p.isPlatformPermission,
      }));

      if (grouped) {
        // Build a map of category → permissions[]
        const byCategory: Record<string, typeof dto> = {};
        for (const p of dto) {
          if (!byCategory[p.category]) byCategory[p.category] = [];
          byCategory[p.category]!.push(p);
        }

        // Convert to sorted array of { category, permissions } objects
        const data = Object.keys(byCategory)
          .sort()
          .map((cat) => ({ category: cat, permissions: byCategory[cat] }));

        return res.json({ status: "success", data });
      }

      res.json({ status: "success", data: dto });
    } catch (err) {
      next(err);
    }
  },
);

export default permissionsRouter;
