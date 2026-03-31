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
import { reportsService } from "./reports.service.ts";

const reportsRouter = Router();

// All reports routes require authentication and active organization
reportsRouter.use(authenticate, requireActiveOrganization);

/* ---------- Shared Query Schema ---------- */

const reportQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  status: z.string().optional(),
  locationId: z.string().optional(),
  customerId: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});

type ReportQuery = z.infer<typeof reportQuerySchema>;

/* ---------- Routes ---------- */

/**
 * GET /api/v1/reports/loans
 * Loan report with duration, overdue analysis, and summary stats.
 * Requires: reports:read
 * Query params: startDate?, endDate?, status?, customerId?, page?, limit?
 */
reportsRouter.get(
  "/loans",
  requirePermission("reports:read"),
  validateQuery(reportQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = req.query as unknown as ReportQuery;
      const data = await reportsService.getLoanReport(getOrgId(req), filters);
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/reports/inventory
 * Inventory report with stock levels by material type and location.
 * Requires: reports:read
 * Query params: locationId?, status?
 */
reportsRouter.get(
  "/inventory",
  requirePermission("reports:read"),
  validateQuery(reportQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = req.query as unknown as ReportQuery;
      const data = await reportsService.getInventoryReport(
        getOrgId(req),
        filters,
      );
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/reports/financial
 * Financial report with invoice breakdown by type and status.
 * Requires: reports:read
 * Query params: startDate?, endDate?, status?, page?, limit?
 */
reportsRouter.get(
  "/financial",
  requirePermission("reports:read"),
  validateQuery(reportQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = req.query as unknown as ReportQuery;
      const data = await reportsService.getFinancialReport(
        getOrgId(req),
        filters,
      );
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/reports/damages
 * Damage and repairs report from inspections.
 * Requires: reports:read
 * Query params: startDate?, endDate?
 */
reportsRouter.get(
  "/damages",
  requirePermission("reports:read"),
  validateQuery(reportQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = req.query as unknown as ReportQuery;
      const data = await reportsService.getDamageReport(
        getOrgId(req),
        filters,
      );
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/reports/transfers
 * Transfer report with inter-location movement history.
 * Requires: reports:read
 * Query params: startDate?, endDate?, status?, page?, limit?
 */
reportsRouter.get(
  "/transfers",
  requirePermission("reports:read"),
  validateQuery(reportQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = req.query as unknown as ReportQuery;
      const data = await reportsService.getTransferReport(
        getOrgId(req),
        filters,
      );
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

export default reportsRouter;
