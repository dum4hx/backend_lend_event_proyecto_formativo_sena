import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { Types } from "mongoose";
import {
  LoanRequest,
  LoanRequestZodSchema,
  requestStatusOptions,
} from "../modules/request/models/request.model.ts";
import { Package } from "../modules/package/models/package.model.ts";
import { Customer } from "../modules/customer/models/customer.model.ts";
import { MaterialInstance } from "../modules/material/models/material_instance.model.ts";
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
  getAuthUser,
} from "../middleware/auth.ts";
import { AppError } from "../errors/AppError.ts";

const requestRouter = Router();

// All routes require authentication and active organization
requestRouter.use(authenticate, requireActiveOrganization);

/* ---------- Validation Schemas ---------- */

const listRequestsQuerySchema = paginationSchema.extend({
  status: z.enum(requestStatusOptions).optional(),
  customerId: z.string().optional(),
  packageId: z.string().optional(),
});

const createRequestSchema = LoanRequestZodSchema.pick({
  customerId: true,
  items: true,
  startDate: true,
  endDate: true,
  notes: true,
}).refine((data) => data.endDate > data.startDate, {
  message: "End date must be after start date",
  path: ["endDate"],
});

const assignMaterialsSchema = z.object({
  assignments: z.array(
    z.object({
      materialTypeId: z.string(),
      materialInstanceId: z.string(),
    }),
  ),
});

const approveRequestSchema = z.object({
  notes: z.string().max(1000).optional(),
});

const rejectRequestSchema = z.object({
  reason: z.string().min(1).max(1000),
});

/* ---------- Routes ---------- */

/**
 * GET /api/v1/requests
 * Lists all loan requests in the organization.
 */
requestRouter.get(
  "/",
  requirePermission("requests:read"),
  validateQuery(listRequestsQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const {
        page = 1,
        limit = 20,
        status,
        customerId,
        packageId,
        sortBy,
        sortOrder,
      } = req.query as unknown as z.infer<typeof listRequestsQuerySchema>;
      const skip = (page - 1) * limit;

      const query: Record<string, unknown> = { organizationId };

      if (status) {
        query.status = status;
      }
      if (customerId) {
        query.customerId = customerId;
      }
      if (packageId) {
        query.packageId = packageId;
      }

      const sortField = sortBy ?? "createdAt";
      const sortDirection = sortOrder === "asc" ? 1 : -1;

      const [requests, total] = await Promise.all([
        LoanRequest.find(query)
          .skip(skip)
          .limit(limit)
          .populate("customerId", "email name")
          .populate("packageId", "name pricePerDay")
          .populate("assignedMaterials.materialInstanceId", "serialNumber")
          .sort({ [sortField]: sortDirection }),
        LoanRequest.countDocuments(query),
      ]);

      res.json({
        status: "success",
        data: {
          requests,
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
 * GET /api/v1/requests/:id
 * Gets a specific request by ID.
 */
requestRouter.get(
  "/:id",
  requirePermission("requests:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const request = await LoanRequest.findOne({
        _id: req.params.id,
        organizationId: getOrgId(req),
      })
        .populate("customerId", "email name phone address")
        .populate("packageId", "name description materialTypes pricePerDay")
        .populate(
          "assignedMaterials.materialInstanceId",
          "serialNumber status modelId",
        );

      if (!request) {
        throw AppError.notFound("Request not found");
      }

      res.json({
        status: "success",
        data: { request },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/requests
 * Creates a new loan request (Commercial Advisor action).
 */
requestRouter.post(
  "/",
  requirePermission("requests:create"),
  validateBody(createRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const user = getAuthUser(req);

      // Validate customer exists and is active
      const customer = await Customer.findOne({
        _id: req.body.customerId,
        organizationId,
        status: "active",
      });

      if (!customer) {
        throw AppError.notFound("Customer not found or inactive");
      }

      // Validate package exists and is active
      const pkg = await Package.findOne({
        _id: req.body.packageId,
        organizationId,
        isActive: true,
      });

      if (!pkg) {
        throw AppError.notFound("Package not found or inactive");
      }

      // Check date validity
      const startDate = new Date(req.body.requestedStartDate);
      const endDate = new Date(req.body.requestedEndDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (startDate < today) {
        throw AppError.badRequest("Start date cannot be in the past");
      }

      if (endDate <= startDate) {
        throw AppError.badRequest("End date must be after start date");
      }

      const request = await LoanRequest.create({
        ...req.body,
        organizationId,
        createdById: user.id,
        status: "pending",
      });

      const populatedRequest = await LoanRequest.findById(request._id)
        .populate("customerId", "email name")
        .populate("packageId", "name pricePerDay");

      res.status(201).json({
        status: "success",
        data: { request: populatedRequest },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/requests/:id/approve
 * Approves a pending request (Manager action).
 */
requestRouter.post(
  "/:id/approve",
  requirePermission("requests:approve"),
  validateBody(approveRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = getAuthUser(req);

      const request = await LoanRequest.findOne({
        _id: req.params.id,
        organizationId: getOrgId(req),
        status: "pending",
      });

      if (!request) {
        throw AppError.notFound("Request not found or not in pending status");
      }

      request.status = "approved";
      request.approvedBy = new Types.ObjectId(user.id);
      request.approvedAt = new Date();
      if (req.body.notes) {
        request.notes =
          (request.notes ?? "") + `\nApproval notes: ${req.body.notes}`;
      }
      await request.save();

      res.json({
        status: "success",
        data: { request },
        message: "Request approved successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/requests/:id/reject
 * Rejects a pending request (Manager action).
 */
requestRouter.post(
  "/:id/reject",
  requirePermission("requests:approve"),
  validateBody(rejectRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const request = await LoanRequest.findOne({
        _id: req.params.id,
        organizationId: getOrgId(req),
        status: "pending",
      });

      if (!request) {
        throw AppError.notFound("Request not found or not in pending status");
      }

      request.status = "rejected";
      request.rejectionReason = req.body.reason;
      await request.save();

      res.json({
        status: "success",
        data: { request },
        message: "Request rejected",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/requests/:id/assign
 * Assigns specific material instances to an approved request (Warehouse Operator action).
 */
requestRouter.post(
  "/:id/assign",
  requirePermission("requests:assign"),
  validateBody(assignMaterialsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const request = await LoanRequest.findOne({
        _id: req.params.id,
        organizationId: getOrgId(req),
        status: "approved",
      }).populate("packageId");

      if (!request) {
        throw AppError.notFound("Request not found or not in approved status");
      }

      const { assignments } = req.body;

      // Validate all material instances are available
      const instanceIds = assignments.map(
        (a: { materialInstanceId: string }) => a.materialInstanceId,
      );
      const instances = await MaterialInstance.find({
        _id: { $in: instanceIds },
        status: "available",
      });

      if (instances.length !== instanceIds.length) {
        throw AppError.badRequest(
          "One or more material instances are not available",
        );
      }

      // Update instance statuses to reserved
      await MaterialInstance.updateMany(
        { _id: { $in: instanceIds } },
        { $set: { status: "reserved" } },
      );

      // Set assigned materials on request
      request.assignedMaterials = assignments.map(
        (a: { materialTypeId: string; materialInstanceId: string }) => ({
          materialTypeId: a.materialTypeId,
          materialInstanceId: a.materialInstanceId,
        }),
      );
      request.status = "assigned";
      await request.save();

      res.json({
        status: "success",
        data: { request },
        message: "Materials assigned successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/requests/:id/ready
 * Marks a request as ready for pickup (Warehouse Operator action).
 */
requestRouter.post(
  "/:id/ready",
  requirePermission("requests:assign"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const request = await LoanRequest.findOne({
        _id: req.params.id,
        organizationId: getOrgId(req),
        status: "assigned",
      });

      if (!request) {
        throw AppError.notFound("Request not found or not in assigned status");
      }

      if (
        !request.assignedMaterials ||
        request.assignedMaterials.length === 0
      ) {
        throw AppError.badRequest("No materials assigned to this request");
      }

      request.status = "ready";
      await request.save();

      res.json({
        status: "success",
        data: { request },
        message: "Request is ready for pickup",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/requests/:id/cancel
 * Cancels a request (Manager/Owner or original creator action).
 */
requestRouter.post(
  "/:id/cancel",
  requirePermission("requests:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const request = await LoanRequest.findOne({
        _id: req.params.id,
        organizationId: getOrgId(req),
        status: { $in: ["pending", "approved", "assigned", "ready"] },
      });

      if (!request) {
        throw AppError.notFound("Request not found or cannot be cancelled");
      }

      // If materials were assigned, release them
      if (request.assignedMaterials && request.assignedMaterials.length > 0) {
        const instanceIds = request.assignedMaterials.map(
          (am) => am.materialInstanceId,
        );
        await MaterialInstance.updateMany(
          { _id: { $in: instanceIds } },
          { $set: { status: "available" } },
        );
      }

      request.status = "cancelled";
      await request.save();

      res.json({
        status: "success",
        data: { request },
        message: "Request cancelled successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

export default requestRouter;
