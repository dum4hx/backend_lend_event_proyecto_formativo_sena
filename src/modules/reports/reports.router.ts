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
      const data = await reportsService.getDamageReport(getOrgId(req), filters);
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

/* ---------- Catalog Export ---------- */

const catalogExportQuerySchema = z.object({
  locationId: z.string().optional(),
  categoryId: z.string().optional(),
  search: z.string().optional(),
  format: z.enum(["json", "csv"]).optional().default("json"),
});

type CatalogExportQuery = z.infer<typeof catalogExportQuerySchema>;

/** Converts a single material-type row into a flat CSV record. */
function materialTypeToRow(mt: any): string {
  const categories = (mt.categories ?? []).map((c: any) => c.name).join("|");
  const alerts = (mt.alerts ?? [])
    .map((a: any) => `${a.severity}:${a.type}`)
    .join("|");
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const fields = [
    mt.name,
    categories,
    mt.pricePerDay ?? 0,
    mt.totals?.totalInstances ?? 0,
    mt.totals?.available ?? 0,
    mt.totals?.reserved ?? 0,
    mt.totals?.loaned ?? 0,
    mt.totals?.inUse ?? 0,
    mt.totals?.returned ?? 0,
    mt.totals?.maintenance ?? 0,
    mt.totals?.damaged ?? 0,
    mt.totals?.lost ?? 0,
    mt.totals?.retired ?? 0,
    pct(mt.metrics?.availabilityRate ?? 0),
    pct(mt.metrics?.utilizationRate ?? 0),
    pct(mt.metrics?.damageRate ?? 0),
    alerts,
  ];
  return fields.map((f) => `"${String(f).replace(/"/g, '""')}"`).join(",");
}

const CSV_HEADER =
  '"name","categories","pricePerDay","totalInstances","available","reserved",' +
  '"loaned","inUse","returned","maintenance","damaged","lost","retired",' +
  '"availabilityRate","utilizationRate","damageRate","alerts"';

/**
 * GET /api/v1/reports/catalog
 * Exports the full material catalog with stock levels, metrics, and alerts.
 * Requires: reports:read
 * Query params: locationId?, categoryId?, search?, format? (json | csv)
 */
reportsRouter.get(
  "/catalog",
  requirePermission("reports:read"),
  validateQuery(catalogExportQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { format, ...filters } = req.query as unknown as CatalogExportQuery;
      const exportFilters: {
        locationId?: string;
        categoryId?: string;
        search?: string;
      } = {};
      if (filters.locationId) exportFilters.locationId = filters.locationId;
      if (filters.categoryId) exportFilters.categoryId = filters.categoryId;
      if (filters.search) exportFilters.search = filters.search;
      const data = await reportsService.getCatalogExport(
        getOrgId(req),
        exportFilters,
      );

      if (format === "csv") {
        const rows = [CSV_HEADER, ...data.materialTypes.map(materialTypeToRow)];
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="catalog-export-${Date.now()}.csv"`,
        );
        return res.send(rows.join("\r\n"));
      }

      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/* ================================================================
 *  EXPORT ENDPOINTS – JSON only, includeIds toggle
 * ================================================================ */

const booleanString = z
  .enum(["true", "false"])
  .optional()
  .default("true")
  .transform((v) => v === "true");

/* --- Schemas --- */

const salesExportQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  includeIds: booleanString,
  customerId: z.string().optional(),
  locationId: z.string().optional(),
  invoiceType: z.string().optional(),
  invoiceStatus: z.string().optional(),
  categoryId: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});

const catalogDetailedExportQuerySchema = z.object({
  includeIds: booleanString,
  categoryId: z.string().optional(),
  locationId: z.string().optional(),
  search: z.string().optional(),
  status: z.string().optional(),
});

const loanActivityExportQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  includeIds: booleanString,
  customerId: z.string().optional(),
  locationId: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});

const damageExportQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  includeIds: booleanString,
  locationId: z.string().optional(),
  batchStatus: z.string().optional(),
  entryReason: z.enum(["damaged", "lost", "other"]).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});

/* --- Routes --- */

/**
 * GET /api/v1/reports/exports/sales
 * Combined loan + invoice sales export with optional business metrics.
 * When includeIds=false, IDs are omitted and an enriched summary with
 * revenue breakdown, monthly trends, top customers, and period comparison
 * is included.
 * Requires: reports:read
 */
reportsRouter.get(
  "/exports/sales",
  requirePermission("reports:read"),
  validateQuery(salesExportQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = req.query as any;
      const data = await reportsService.getSalesExport(getOrgId(req), filters);
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/reports/exports/catalog
 * Detailed catalog export with per-location/status breakdown and enriched
 * metrics (utilization, availability, revenue, maintenance cost) when
 * includeIds=false.
 * Requires: reports:read
 */
reportsRouter.get(
  "/exports/catalog",
  requirePermission("reports:read"),
  validateQuery(catalogDetailedExportQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = req.query as any;
      const data = await reportsService.getCatalogDetailedExport(
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
 * GET /api/v1/reports/exports/loan-activity
 * Loan activity export with duration analysis, overdue/return rates,
 * monthly trends, top materials/customers, and period comparison when
 * includeIds=false.
 * Requires: reports:read
 */
reportsRouter.get(
  "/exports/loan-activity",
  requirePermission("reports:read"),
  validateQuery(loanActivityExportQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = req.query as any;
      const data = await reportsService.getLoanActivityExport(
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
 * GET /api/v1/reports/exports/damages
 * Maintenance batch and damage export with cost analysis, repair time,
 * most-damaged materials, and period comparison when includeIds=false.
 * Requires: reports:read
 */
reportsRouter.get(
  "/exports/damages",
  requirePermission("reports:read"),
  validateQuery(damageExportQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = req.query as any;
      const data = await reportsService.getDamageExport(getOrgId(req), filters);
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/* ---------- Inventory & Transfer Export Schemas ---------- */

const inventoryExportQuerySchema = z.object({
  includeIds: booleanString,
  locationId: z.string().optional(),
  categoryId: z.string().optional(),
  status: z.string().optional(),
  search: z.string().optional(),
});

const transferExportQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  includeIds: booleanString,
  status: z.string().optional(),
  fromLocationId: z.string().optional(),
  toLocationId: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});

/**
 * GET /api/v1/reports/exports/inventory
 * Inventory export grouped by material type and location, with enriched
 * utilization/damage/availability metrics when includeIds=false.
 * Requires: reports:read
 */
reportsRouter.get(
  "/exports/inventory",
  requirePermission("reports:read"),
  validateQuery(inventoryExportQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = req.query as any;
      const data = await reportsService.getInventoryExport(
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
 * GET /api/v1/reports/exports/transfers
 * Transfer export with condition tracking, route analysis, and transit
 * time metrics when includeIds=false.
 * Requires: reports:read
 */
reportsRouter.get(
  "/exports/transfers",
  requirePermission("reports:read"),
  validateQuery(transferExportQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = req.query as any;
      const data = await reportsService.getTransferExport(
        getOrgId(req),
        filters,
      );
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/* ---------- Billing History Export Schema ---------- */

const billingHistoryExportQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  includeIds: booleanString,
  eventType: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});

/**
 * GET /api/v1/reports/exports/billing-history
 * Billing history export with subscription lifecycle events, payment
 * tracking, plan changes, and cost analytics when includeIds=false.
 * Requires: reports:read AND billing:manage
 */
reportsRouter.get(
  "/exports/billing-history",
  requirePermission("reports:read"),
  requirePermission("billing:manage"),
  validateQuery(billingHistoryExportQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = req.query as any;
      const data = await reportsService.getBillingHistoryExport(
        getOrgId(req),
        filters,
      );
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/* ---------- Location Export Schema ---------- */

const locationExportQuerySchema = z.object({
  includeIds: booleanString,
  locationId: z.string().optional(),
  status: z.string().optional(),
  isActive: booleanString.optional(),
  search: z.string().optional(),
});

/**
 * GET /api/v1/reports/exports/locations
 * Location catalog export with material capacity detail/summary
 * and occupancy analytics when includeIds=false.
 * Requires: reports:read
 */
reportsRouter.get(
  "/exports/locations",
  requirePermission("reports:read"),
  validateQuery(locationExportQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = req.query as any;
      const data = await reportsService.getLocationsExport(
        getOrgId(req),
        filters,
      );
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/* ---------- Customer Export Schema ---------- */

const customerExportQuerySchema = z.object({
  includeIds: booleanString,
  status: z.string().optional(),
  search: z.string().optional(),
  documentType: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});

/**
 * GET /api/v1/reports/exports/customers
 * Customer export with real revenue from loans and enriched
 * top-revenue/top-loan metrics when includeIds=false.
 * Requires: reports:read
 */
reportsRouter.get(
  "/exports/customers",
  requirePermission("reports:read"),
  validateQuery(customerExportQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = req.query as any;
      const data = await reportsService.getCustomersExport(
        getOrgId(req),
        filters,
      );
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/* ---------- Request Export Schema ---------- */

const requestExportQuerySchema = z.object({
  includeIds: booleanString,
  createdAtStart: z.coerce.date().optional(),
  createdAtEnd: z.coerce.date().optional(),
  loanStartFrom: z.coerce.date().optional(),
  loanStartTo: z.coerce.date().optional(),
  status: z.string().optional(),
  customerId: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});

/**
 * GET /api/v1/reports/exports/requests
 * Loan request export with conversion funnel, revenue analytics,
 * and period comparison when includeIds=false.
 * Requires: reports:read
 */
reportsRouter.get(
  "/exports/requests",
  requirePermission("reports:read"),
  validateQuery(requestExportQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = req.query as any;
      const data = await reportsService.getRequestsExport(
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
