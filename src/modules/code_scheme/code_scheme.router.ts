import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import {
  CodeSchemeZodSchema,
  CodeSchemeUpdateZodSchema,
  entityTypeOptions,
} from "./models/code_scheme.model.ts";
import { codeSchemeService } from "./code_scheme.service.ts";
import { validateBody, validateQuery } from "../../middleware/validation.ts";
import {
  authenticate,
  requireActiveOrganization,
  requirePermission,
  getOrgId,
} from "../../middleware/auth.ts";

const codeSchemeRouter = Router();

// All routes require authentication and an active organization
codeSchemeRouter.use(authenticate, requireActiveOrganization);

/* ---------- Query Schema ---------- */

const listQuerySchema = z.object({
  entityType: z.enum(entityTypeOptions).optional(),
});

/* ---------- Routes ---------- */

/**
 * GET /api/v1/code-schemes
 * Lists all code schemes for the organization.
 * Optional query: ?entityType=loan | loan_request
 * Requires: code_schemes:read
 */
codeSchemeRouter.get(
  "/",
  requirePermission("code_schemes:read"),
  validateQuery(listQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const { entityType } = req.query as { entityType?: string };
      const schemes = await codeSchemeService.listSchemes(organizationId, {
        entityType: entityType as any,
      });
      res.json({ status: "success", data: { schemes } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/code-schemes/:id
 * Gets a single code scheme by ID.
 * Requires: code_schemes:read
 */
codeSchemeRouter.get(
  "/:id",
  requirePermission("code_schemes:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const scheme = await codeSchemeService.getSchemeById(
        organizationId,
        req.params["id"] as string,
      );
      res.json({ status: "success", data: { scheme } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/code-schemes
 * Creates a new code scheme.
 * Requires: code_schemes:create
 */
codeSchemeRouter.post(
  "/",
  requirePermission("code_schemes:create"),
  validateBody(CodeSchemeZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const scheme = await codeSchemeService.createScheme(
        organizationId,
        req.body,
      );
      res.status(201).json({ status: "success", data: { scheme } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PUT /api/v1/code-schemes/:id
 * Updates an existing code scheme.
 * Requires: code_schemes:update
 */
codeSchemeRouter.put(
  "/:id",
  requirePermission("code_schemes:update"),
  validateBody(CodeSchemeUpdateZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const scheme = await codeSchemeService.updateScheme(
        organizationId,
        req.params["id"] as string,
        req.body,
      );
      res.json({ status: "success", data: { scheme } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/code-schemes/:id
 * Deletes a code scheme (cannot delete the default one).
 * Requires: code_schemes:delete
 */
codeSchemeRouter.delete(
  "/:id",
  requirePermission("code_schemes:delete"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      await codeSchemeService.deleteScheme(
        organizationId,
        req.params["id"] as string,
      );
      res.json({ status: "success", data: null });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/code-schemes/:id/set-default
 * Sets a code scheme as the default for its entity type.
 * Requires: code_schemes:update
 */
codeSchemeRouter.patch(
  "/:id/set-default",
  requirePermission("code_schemes:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const scheme = await codeSchemeService.setAsDefault(
        organizationId,
        req.params["id"] as string,
      );
      res.json({ status: "success", data: { scheme } });
    } catch (err) {
      next(err);
    }
  },
);

export default codeSchemeRouter;
