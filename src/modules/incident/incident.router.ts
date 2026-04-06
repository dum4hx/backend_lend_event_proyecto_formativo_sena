import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { incidentService } from "./incident.service.ts";
import {
  IncidentZodSchema,
  ResolveIncidentZodSchema,
  DismissIncidentZodSchema,
  incidentStatusOptions,
  incidentTypeOptions,
  incidentSeverityOptions,
  incidentSourceTypeOptions,
  incidentContextOptions,
} from "./models/incident.model.ts";
import {
  validateBody,
  validateQuery,
  paginationSchema,
} from "../../middleware/validation.ts";
import {
  authenticate,
  requireActiveOrganization,
  requirePermission,
  getOrgId,
  getAuthUser,
} from "../../middleware/auth.ts";
import { AppError } from "../../errors/AppError.ts";
import { z } from "zod";

const incidentRouter = Router();

// All routes require authentication and active organization
incidentRouter.use(authenticate, requireActiveOrganization);

/* ---------- Validation Schemas ---------- */

const listIncidentsQuerySchema = paginationSchema.extend({
  loanId: z.string().optional(),
  locationId: z.string().optional(),
  context: z.enum(incidentContextOptions).optional(),
  type: z.enum(incidentTypeOptions).optional(),
  status: z.enum(incidentStatusOptions).optional(),
  severity: z.enum(incidentSeverityOptions).optional(),
  sourceType: z.enum(incidentSourceTypeOptions).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

/* ---------- Routes ---------- */

/**
 * GET /api/v1/incidents
 * Lists all incidents in the organization.
 * Permission: incidents:read
 */
incidentRouter.get(
  "/",
  requirePermission("incidents:read"),
  validateQuery(listIncidentsQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const query = req.query as any;

      const result = await incidentService.listIncidents(organizationId, query);

      res.json({
        status: "success",
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/incidents/:id
 * Gets a specific incident by ID.
 * Permission: incidents:read
 */
incidentRouter.get(
  "/:id",
  requirePermission("incidents:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const incidentId = req.params.id;

      if (!incidentId || typeof incidentId !== "string") {
        throw AppError.badRequest("Invalid incident ID");
      }

      const incident = await incidentService.getIncidentById(
        incidentId,
        organizationId,
      );

      res.json({
        status: "success",
        data: { incident },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/incidents
 * Creates a new incident manually.
 * Permission: incidents:create
 */
incidentRouter.post(
  "/",
  requirePermission("incidents:create"),
  validateBody(IncidentZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const user = getAuthUser(req);

      const incident = await incidentService.createIncident({
        organizationId,
        loanId: req.body.loanId,
        locationId: req.body.locationId,
        context: req.body.context,
        type: req.body.type,
        createdBy: user.id,
        sourceType: "manual",
        severity: req.body.severity,
        relatedMaterialInstances: req.body.relatedMaterialInstances,
        description: req.body.description,
        financialImpact: req.body.financialImpact,
        metadata: req.body.metadata,
      });

      res.status(201).json({
        status: "success",
        data: { incident },
        message: "Incident created successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/incidents/:id/acknowledge
 * Acknowledges an open incident.
 * Permission: incidents:acknowledge
 */
incidentRouter.post(
  "/:id/acknowledge",
  requirePermission("incidents:acknowledge"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const user = getAuthUser(req);
      const incidentId = req.params.id;

      if (!incidentId || typeof incidentId !== "string") {
        throw AppError.badRequest("Invalid incident ID");
      }

      const incident = await incidentService.acknowledgeIncident(
        incidentId,
        organizationId,
        user.id,
      );

      res.json({
        status: "success",
        data: { incident },
        message: "Incident acknowledged",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/incidents/:id/resolve
 * Resolves an incident with a resolution note.
 * Permission: incidents:resolve
 */
incidentRouter.post(
  "/:id/resolve",
  requirePermission("incidents:resolve"),
  validateBody(ResolveIncidentZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const user = getAuthUser(req);
      const incidentId = req.params.id;

      if (!incidentId || typeof incidentId !== "string") {
        throw AppError.badRequest("Invalid incident ID");
      }

      const incident = await incidentService.resolveIncident(
        incidentId,
        organizationId,
        user.id,
        req.body.resolution,
      );

      res.json({
        status: "success",
        data: { incident },
        message: "Incident resolved",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/incidents/:id/dismiss
 * Dismisses an open or acknowledged incident.
 * Permission: incidents:dismiss
 */
incidentRouter.post(
  "/:id/dismiss",
  requirePermission("incidents:dismiss"),
  validateBody(DismissIncidentZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const user = getAuthUser(req);
      const incidentId = req.params.id;

      if (!incidentId || typeof incidentId !== "string") {
        throw AppError.badRequest("Invalid incident ID");
      }

      const incident = await incidentService.dismissIncident(
        incidentId,
        organizationId,
        user.id,
        req.body.resolution,
      );

      res.json({
        status: "success",
        data: { incident },
        message: "Incident dismissed",
      });
    } catch (err) {
      next(err);
    }
  },
);

export default incidentRouter;
