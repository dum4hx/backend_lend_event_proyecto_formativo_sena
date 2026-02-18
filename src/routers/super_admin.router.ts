import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { adminService } from "../modules/super_admin/super_admin.service.ts";
import { authenticate, requireRole } from "../middleware/auth.ts";

const adminRouter = Router();

/* ---------- Apply super_admin authentication to all routes ---------- */
adminRouter.use(authenticate);
adminRouter.use(requireRole("super_admin"));

/* ---------- Platform Overview ---------- */

/**
 * GET /api/v1/admin/analytics/overview
 * Gets high-level platform statistics.
 * No PII - only aggregated counts and metrics.
 */
adminRouter.get(
  "/analytics/overview",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const overview = await adminService.getPlatformOverview();

      res.json({
        status: "success",
        data: {
          overview,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/* ---------- Organization Activity ---------- */

/**
 * GET /api/v1/admin/analytics/organizations
 * Gets aggregated organization activity statistics.
 * No PII - only statistical distributions and trends.
 */
adminRouter.get(
  "/analytics/organizations",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const periodMonths = parseInt(req.query.periodMonths as string) || 12;
      const stats = await adminService.getOrganizationActivity(periodMonths);

      res.json({
        status: "success",
        data: {
          periodMonths,
          stats,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/* ---------- Organization PII Activity ---------- */

/**
 * GET /api/v1/admin/analytics/organizations-pii
 * Gets a paginated list of all organizations with their details.
 */
adminRouter.get(
  "/analytics/organizations-pii",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const result = await adminService.getOrganizationPii(page, limit);

      res.json({
        status: "success",
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
);

/* ---------- User Activity ---------- */

/**
 * GET /api/v1/admin/analytics/users
 * Gets aggregated user activity statistics.
 * No PII - only role/status distributions and trends.
 */
adminRouter.get(
  "/analytics/users",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const periodMonths = parseInt(req.query.periodMonths as string) || 12;
      const stats = await adminService.getUserActivity(periodMonths);

      res.json({
        status: "success",
        data: {
          periodMonths,
          stats,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/* ---------- Revenue Statistics ---------- */

/**
 * GET /api/v1/admin/analytics/revenue
 * Gets revenue statistics and trends.
 * No PII - only financial aggregates.
 */
adminRouter.get(
  "/analytics/revenue",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const periodMonths = parseInt(req.query.periodMonths as string) || 12;
      const stats = await adminService.getRevenueStats(periodMonths);

      res.json({
        status: "success",
        data: {
          periodMonths,
          stats,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/* ---------- Subscription Statistics ---------- */

/**
 * GET /api/v1/admin/analytics/subscriptions
 * Gets subscription distribution and churn metrics.
 */
adminRouter.get(
  "/analytics/subscriptions",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await adminService.getSubscriptionStats();

      res.json({
        status: "success",
        data: {
          stats,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/* ---------- Platform Health ---------- */

/**
 * GET /api/v1/admin/analytics/health
 * Gets platform health metrics (overdue items, errors).
 */
adminRouter.get(
  "/analytics/health",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const health = await adminService.getPlatformHealth();

      res.json({
        status: "success",
        data: {
          health,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/* ---------- Recent Activity ---------- */

/**
 * GET /api/v1/admin/analytics/activity
 * Gets recent platform billing activity (non-PII event log).
 */
adminRouter.get(
  "/analytics/activity",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const activity = await adminService.getRecentActivity(limit);

      res.json({
        status: "success",
        data: {
          activity,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/* ---------- Combined Dashboard ---------- */

/**
 * GET /api/v1/admin/analytics/dashboard
 * Gets all analytics in a single call for dashboard rendering.
 */
adminRouter.get(
  "/analytics/dashboard",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [
        overview,
        organizationStats,
        userStats,
        subscriptionStats,
        health,
      ] = await Promise.all([
        adminService.getPlatformOverview(),
        adminService.getOrganizationActivity(6),
        adminService.getUserActivity(6),
        adminService.getSubscriptionStats(),
        adminService.getPlatformHealth(),
      ]);

      res.json({
        status: "success",
        data: {
          overview,
          organizationStats,
          userStats,
          subscriptionStats,
          health,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

export { adminRouter };
