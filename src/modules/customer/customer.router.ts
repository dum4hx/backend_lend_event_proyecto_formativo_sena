import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import {
  CustomerZodSchema,
  CustomerUpdateZodSchema,
  documentTypes,
} from "./models/customer.model.ts";
import { customerService } from "./customer.service.ts";
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
} from "../../middleware/auth.ts";

const customerRouter = Router();

// All routes require authentication and active organization
customerRouter.use(authenticate, requireActiveOrganization);

/* ---------- Validation Schemas ---------- */

const listCustomersQuerySchema = paginationSchema.extend({
  status: z.enum(["active", "inactive", "blacklisted"]).optional(),
  search: z.string().optional(),
});

/* ---------- Routes ---------- */

/**
 * GET /api/v1/customers/document-types
 * Returns all valid document types with their display names.
 */
customerRouter.get(
  "/document-types",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({
        status: "success",
        data: {
          documentTypes,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/customers
 * Lists all customers in the organization.
 * Requires: customers:read
 */
customerRouter.get(
  "/",
  requirePermission("customers:read"),
  validateQuery(listCustomersQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const query = req.query as unknown as z.infer<
        typeof listCustomersQuerySchema
      >;
      const data = await customerService.listCustomers(organizationId, query);

      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/customers/:id
 * Gets a specific customer by ID.
 * Requires: customers:read
 */
customerRouter.get(
  "/:id",
  requirePermission("customers:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customer = await customerService.getCustomerById(
        req.params.id as string,
        getOrgId(req),
      );
      res.json({ status: "success", data: { customer } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/customers
 * Creates a new customer.
 * Requires: customers:create
 */
customerRouter.post(
  "/",
  requirePermission("customers:create"),
  validateBody(CustomerZodSchema.omit({ organizationId: true })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customer = await customerService.createCustomer(
        getOrgId(req),
        req.body,
      );
      res.status(201).json({ status: "success", data: { customer } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/customers/:id
 * Updates a customer's information.
 * Requires: customers:update
 */
customerRouter.patch(
  "/:id",
  requirePermission("customers:update"),
  validateBody(CustomerUpdateZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customer = await customerService.updateCustomer(
        req.params.id as string,
        getOrgId(req),
        req.body,
      );
      res.json({ status: "success", data: { customer } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/customers/:id/activate
 * Activates (or reactivates) a customer.
 * Requires: customers:update
 */
customerRouter.post(
  "/:id/activate",
  requirePermission("customers:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customer = await customerService.changeStatus(
        req.params.id as string,
        getOrgId(req),
        "active",
      );
      res.json({
        status: "success",
        data: { customer },
        message: "Customer activated successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/customers/:id/deactivate
 * Deactivates a customer (sets status to inactive).
 * Requires: customers:update
 */
customerRouter.post(
  "/:id/deactivate",
  requirePermission("customers:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customer = await customerService.changeStatus(
        req.params.id as string,
        getOrgId(req),
        "inactive",
      );
      res.json({
        status: "success",
        data: { customer },
        message: "Customer deactivated successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/customers/:id/blacklist
 * Blacklists a customer.
 * Requires: customers:update
 */
customerRouter.post(
  "/:id/blacklist",
  requirePermission("customers:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customer = await customerService.changeStatus(
        req.params.id as string,
        getOrgId(req),
        "blacklisted",
      );
      res.json({
        status: "success",
        data: { customer },
        message: "Customer blacklisted successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/customers/:id
 * Soft-deletes a customer (sets status to inactive). Blocks if active loans exist.
 * Requires: customers:delete
 */
customerRouter.delete(
  "/:id",
  requirePermission("customers:delete"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await customerService.deleteCustomer(
        req.params.id as string,
        getOrgId(req),
      );
      res.json({
        status: "success",
        message: "Customer deleted successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

export default customerRouter;
