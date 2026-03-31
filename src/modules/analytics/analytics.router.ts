import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import {
  authenticate,
  requireActiveOrganization,
  requirePermission,
  getOrgId,
} from "../../middleware/auth.ts";
import { validateQuery } from "../../middleware/validation.ts";
import { analyticsService } from "./analytics.service.ts";

const analyticsRouter = Router();

// All analytics routes require authentication and active organization
analyticsRouter.use(authenticate, requireActiveOrganization);

/* ---------- Shared query schema ---------- */

const dateRangeQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;

function parseDateRange(query: DateRangeQuery) {
  const { startDate, endDate } = query;
  if (!startDate && !endDate) return undefined;
  const range: { startDate?: Date; endDate?: Date } = {};
  if (startDate) range.startDate = startDate;
  if (endDate) range.endDate = endDate;
  return range;
}

/**
 * GET /api/v1/analytics/overview
 * Returns a high-level dashboard overview (customer, material, loan, invoice counts).
 * Requires: analytics:read
 * Query params: startDate?, endDate? (ISO 8601)
 */
analyticsRouter.get(
  "/overview",
  requirePermission("analytics:read"),
  validateQuery(dateRangeQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dateRange = parseDateRange(req.query as unknown as DateRangeQuery);
      const data = await analyticsService.getOverview(getOrgId(req), dateRange);
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/analytics/materials
 * Returns material utilization stats: status breakdown and most-used materials.
 * Requires: analytics:read
 */
analyticsRouter.get(
  "/materials",
  requirePermission("analytics:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await analyticsService.getMaterialStats(getOrgId(req));
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/analytics/revenue
 * Returns revenue breakdown by month and by invoice type.
 * Defaults to last 12 months if no date range provided.
 * Requires: analytics:read
 * Query params: startDate?, endDate? (ISO 8601)
 */
analyticsRouter.get(
  "/revenue",
  requirePermission("analytics:read"),
  validateQuery(dateRangeQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dateRange = parseDateRange(req.query as unknown as DateRangeQuery);
      const data = await analyticsService.getRevenueStats(getOrgId(req), dateRange);
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/analytics/customers
 * Returns customer status breakdown and top customers by loan count.
 * Requires: analytics:read
 */
analyticsRouter.get(
  "/customers",
  requirePermission("analytics:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await analyticsService.getCustomerStats(getOrgId(req));
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

export default analyticsRouter;
