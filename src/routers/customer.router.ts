import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { Types } from "mongoose";
import {
  Customer,
  CustomerZodSchema,
  CustomerUpdateZodSchema,
  documentTypes,
} from "../modules/customer/models/customer.model.ts";
import {
  validateBody,
  validateQuery,
  paginationSchema,
} from "../middleware/validation.ts";
import {
  authenticate,
  requireActiveOrganization,
  requirePermission,
  getOrgId,
} from "../middleware/auth.ts";
import { AppError } from "../errors/AppError.ts";

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
 */
customerRouter.get(
  "/",
  requirePermission("customers:read"),
  validateQuery(listCustomersQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const {
        page = 1,
        limit = 20,
        status,
        search,
        sortBy,
        sortOrder,
      } = req.query as unknown as z.infer<typeof listCustomersQuerySchema>;
      const skip = (page - 1) * limit;

      const query: Record<string, unknown> = { organizationId };

      if (status) {
        query.status = status;
      }

      if (search) {
        query.$or = [
          { email: { $regex: search, $options: "i" } },
          { "name.firstName": { $regex: search, $options: "i" } },
          { "name.firstSurname": { $regex: search, $options: "i" } },
          { documentNumber: { $regex: search, $options: "i" } },
        ];
      }

      const sortField = sortBy ?? "createdAt";
      const sortDirection = sortOrder === "asc" ? 1 : -1;

      const [customers, total] = await Promise.all([
        Customer.find(query)
          .skip(skip)
          .limit(limit)
          .sort({ [sortField]: sortDirection }),
        Customer.countDocuments(query),
      ]);

      res.json({
        status: "success",
        data: {
          customers,
          total,
          page,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/customers/:id
 * Gets a specific customer by ID.
 */
customerRouter.get(
  "/:id",
  requirePermission("customers:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customer = await Customer.findOne({
        _id: req.params.id,
        organizationId: getOrgId(req),
      });

      if (!customer) {
        throw AppError.notFound("Customer not found");
      }

      res.json({
        status: "success",
        data: { customer },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/customers
 * Creates a new customer.
 */
customerRouter.post(
  "/",
  requirePermission("customers:create"),
  validateBody(CustomerZodSchema.omit({ organizationId: true })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);

      // Check for duplicate email
      const existing = await Customer.findOne({
        organizationId,
        email: req.body.email.toLowerCase(),
      });

      if (existing) {
        throw AppError.conflict("A customer with this email already exists");
      }

      const customer = await Customer.create({
        ...req.body,
        organizationId,
      });

      res.status(201).json({
        status: "success",
        data: { customer },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/customers/:id
 * Updates a customer's information.
 */
customerRouter.patch(
  "/:id",
  requirePermission("customers:update"),
  validateBody(CustomerUpdateZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customer = await Customer.findOneAndUpdate(
        { _id: req.params.id, organizationId: getOrgId(req) },
        { $set: req.body },
        { new: true, runValidators: true },
      );

      if (!customer) {
        throw AppError.notFound("Customer not found");
      }

      res.json({
        status: "success",
        data: { customer },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/customers/:id/blacklist
 * Blacklists a customer.
 */
customerRouter.post(
  "/:id/blacklist",
  requirePermission("customers:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customer = await Customer.findOneAndUpdate(
        { _id: req.params.id, organizationId: getOrgId(req) },
        { $set: { status: "blacklisted" } },
        { new: true },
      );

      if (!customer) {
        throw AppError.notFound("Customer not found");
      }

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
 * Deletes a customer (soft delete by setting status to inactive).
 */
customerRouter.delete(
  "/:id",
  requirePermission("customers:delete"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customerId = req.params.id as string;

      // Check if customer has active loans
      const { Loan } = await import("../modules/loan/models/loan.model.ts");
      const activeLoans = await Loan.countDocuments({
        customerId,
        status: { $in: ["active", "overdue"] },
      });

      if (activeLoans > 0) {
        throw AppError.badRequest("Cannot delete customer with active loans");
      }

      const customer = await Customer.findOneAndUpdate(
        { _id: req.params.id, organizationId: getOrgId(req) },
        { $set: { status: "inactive" } },
        { new: true },
      );

      if (!customer) {
        throw AppError.notFound("Customer not found");
      }

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
