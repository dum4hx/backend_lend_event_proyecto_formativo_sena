import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { Types } from "mongoose";
import {
  authenticate,
  requireActiveOrganization,
  requirePermission,
  getOrgId,
} from "../../middleware/auth.ts";
import { AppError } from "../../errors/AppError.ts";
import { operationsService } from "./operations.service.ts";

/**
 * ============================================================================
 * OPERATIONS ROUTER
 * ============================================================================
 *
 * Smart operational endpoints that provide pre-computed, actionable data
 * for a TO-DO-like operational dashboard per location.
 *
 * All endpoints are:
 * - Tenant-scoped (organizationId from JWT)
 * - Location-scoped (locationId from URL param)
 * - Permission-protected (operations:read)
 * - Return aggregated, UI-ready data
 *
 * Available endpoints:
 * - GET /locations/:locationId/operations/overview       — High-level metrics
 * - GET /locations/:locationId/operations/inspections    — Inspection work queue
 * - GET /locations/:locationId/operations/financials/overdue — Overdue obligations
 * - GET /locations/:locationId/operations/inventory/issues   — Inventory problems
 * - GET /locations/:locationId/operations/transfers      — Transfer action queue
 * - GET /locations/:locationId/operations/loans/deadlines — Loan deadline tracker
 * - GET /locations/:locationId/operations/damages        — Damage resolution queue
 * - GET /locations/:locationId/operations/tasks          — Global task aggregator
 * ============================================================================
 */

const operationsRouter = Router({ mergeParams: true });

// All operations routes require authentication, active org, and operations:read
operationsRouter.use(
  authenticate,
  requireActiveOrganization,
  requirePermission("operations:read"),
);

/* ---------- Param helper ---------- */

function getLocationId(req: Request): Types.ObjectId {
  const locationId = req.params.locationId as string;
  if (!locationId || !Types.ObjectId.isValid(locationId)) {
    throw AppError.badRequest("Invalid location ID format");
  }
  return new Types.ObjectId(locationId);
}

/* ----------------------------------------------------------------
 * GET /operations/overview
 * ---------------------------------------------------------------- */
operationsRouter.get(
  "/overview",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await operationsService.getOverview(
        getOrgId(req),
        getLocationId(req),
      );
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/* ----------------------------------------------------------------
 * GET /operations/inspections
 * ---------------------------------------------------------------- */
operationsRouter.get(
  "/inspections",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await operationsService.getInspectionQueue(
        getOrgId(req),
        getLocationId(req),
      );
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/* ----------------------------------------------------------------
 * GET /operations/financials/overdue
 * ---------------------------------------------------------------- */
operationsRouter.get(
  "/financials/overdue",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await operationsService.getOverdueFinancials(
        getOrgId(req),
        getLocationId(req),
      );
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/* ----------------------------------------------------------------
 * GET /operations/inventory/issues
 * ---------------------------------------------------------------- */
operationsRouter.get(
  "/inventory/issues",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await operationsService.getInventoryIssues(
        getOrgId(req),
        getLocationId(req),
      );
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/* ----------------------------------------------------------------
 * GET /operations/transfers
 * ---------------------------------------------------------------- */
operationsRouter.get(
  "/transfers",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await operationsService.getTransferQueue(
        getOrgId(req),
        getLocationId(req),
      );
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/* ----------------------------------------------------------------
 * GET /operations/loans/deadlines
 * ---------------------------------------------------------------- */
operationsRouter.get(
  "/loans/deadlines",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await operationsService.getLoanDeadlines(
        getOrgId(req),
        getLocationId(req),
      );
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/* ----------------------------------------------------------------
 * GET /operations/damages
 * ---------------------------------------------------------------- */
operationsRouter.get(
  "/damages",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await operationsService.getDamageQueue(
        getOrgId(req),
        getLocationId(req),
      );
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/* ----------------------------------------------------------------
 * GET /operations/tasks
 * ---------------------------------------------------------------- */
operationsRouter.get(
  "/tasks",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await operationsService.getTasks(
        getOrgId(req),
        getLocationId(req),
      );
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

export default operationsRouter;
