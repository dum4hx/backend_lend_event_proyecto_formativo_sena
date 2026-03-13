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
  type LoanRequestDocument,
  LoanRequestZodSchema,
  requestStatusOptions,
} from "./models/request.model.ts";
import { Package } from "../package/models/package.model.ts";
import { MaterialModel } from "../material/models/material_type.model.ts";
import { Customer } from "../customer/models/customer.model.ts";
import { MaterialInstance } from "../material/models/material_instance.model.ts";
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

const requestRouter = Router();

// All routes require authentication and active organization
requestRouter.use(authenticate, requireActiveOrganization);

/* ---------- Validation Schemas ---------- */

const listRequestsQuerySchema = paginationSchema.extend({
  status: z.enum(requestStatusOptions).optional(),
  customerId: z
    .string()
    .refine((val) => Types.ObjectId.isValid(val), {
      message: "Invalid customerId format",
    })
    .optional(),
  packageId: z
    .string()
    .refine((val) => Types.ObjectId.isValid(val), {
      message: "Invalid packageId format",
    })
    .optional(),
});

const createRequestItemSchema = z.object({
  type: z.string().optional(),
  referenceId: z.string().optional(),
  materialTypeId: z.string().optional(),
  packageId: z.string().optional(),
  quantity: z.number().int().positive().default(1),
});

type NormalizedRequestItem = {
  type: "material" | "package";
  referenceId: string;
  quantity: number;
};

const normalizeRequestItem = (
  item: z.infer<typeof createRequestItemSchema>,
  itemIndex: number,
): NormalizedRequestItem => {
  const fallbackType = item.materialTypeId
    ? "material"
    : item.packageId
      ? "package"
      : undefined;

  const resolvedType = item.type ?? fallbackType;

  if (resolvedType !== "material" && resolvedType !== "package") {
    throw AppError.badRequest(`Invalid type for item at index ${itemIndex}`);
  }

  const resolvedReferenceId =
    item.referenceId ??
    (resolvedType === "material" ? item.materialTypeId : item.packageId);

  if (!resolvedReferenceId || !Types.ObjectId.isValid(resolvedReferenceId)) {
    throw AppError.badRequest(
      `Invalid referenceId for ${resolvedType} item at index ${itemIndex}`,
    );
  }

  return {
    type: resolvedType,
    referenceId: resolvedReferenceId,
    quantity: item.quantity,
  };
};

const createRequestSchema = LoanRequestZodSchema.pick({
  customerId: true,
  startDate: true,
  endDate: true,
  notes: true,
})
  .extend({
    items: z
      .array(createRequestItemSchema)
      .min(1, "At least one item is required"),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "End date must be after start date",
    path: ["endDate"],
  });

const assignMaterialsSchema = z.object({
  assignments: z
    .array(
      z.object({
        materialTypeId: z.string().refine((val) => Types.ObjectId.isValid(val), {
          message: "Invalid materialTypeId format",
        }),
        materialInstanceId: z
          .string()
          .refine((val) => Types.ObjectId.isValid(val), {
            message: "Invalid materialInstanceId format",
          }),
      }),
    )
    .min(1, "At least one assignment is required"),
});

const approveRequestSchema = z.object({
  notes: z.string().max(1000).optional(),
});

const rejectRequestSchema = z.object({
  reason: z.string().min(1).max(1000),
});

type AssignmentInput = z.infer<typeof assignMaterialsSchema>["assignments"][number];

type AssignmentWithIndex = {
  materialInstanceId: Types.ObjectId;
  itemIndex: number;
};

const buildMaterialTypeQueues = (
  request: LoanRequestDocument,
): Map<string, number[]> => {
  const queues = new Map<string, number[]>();

  request.items.forEach((item, itemIndex) => {
    if (item.type !== "material") {
      return;
    }

    const materialTypeId = new Types.ObjectId(item.referenceId).toString();
    const queue = queues.get(materialTypeId) ?? [];

    for (let i = 0; i < item.quantity; i++) {
      queue.push(itemIndex);
    }

    queues.set(materialTypeId, queue);
  });

  return queues;
};

const mapAssignmentsToRequestItemIndexes = (
  request: LoanRequestDocument,
  assignments: AssignmentInput[],
): AssignmentWithIndex[] => {
  const materialTypeQueues = buildMaterialTypeQueues(request);

  return assignments.map((assignment, index) => {
    const materialTypeId = new Types.ObjectId(assignment.materialTypeId).toString();
    const itemQueue = materialTypeQueues.get(materialTypeId);

    if (!itemQueue || itemQueue.length === 0) {
      throw AppError.badRequest(
        `Assignment at index ${index} does not match any request material item or exceeds requested quantity`,
      );
    }

    const itemIndex = itemQueue.shift();

    if (itemIndex === undefined) {
      throw AppError.badRequest(
        `Unable to map assignment at index ${index} to request item`,
      );
    }

    return {
      materialInstanceId: new Types.ObjectId(assignment.materialInstanceId),
      itemIndex,
    };
  });
};

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
        query.items = {
          $elemMatch: {
            type: "package",
            referenceId: new Types.ObjectId(packageId),
          },
        };
      }

      const sortField = sortBy ?? "createdAt";
      const sortDirection = sortOrder === "asc" ? 1 : -1;

      const [requests, total] = await Promise.all([
        LoanRequest.find(query)
          .skip(skip)
          .limit(limit)
          .populate("customerId", "email name")
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

      const normalizedItems = req.body.items.map(
        (item: z.infer<typeof createRequestItemSchema>, index: number) =>
          normalizeRequestItem(item, index),
      );

      // Resolve each item reference by type to ensure requests cannot be created
      // with invalid or inactive catalog references.
      for (let itemIndex = 0; itemIndex < normalizedItems.length; itemIndex++) {
        const item = normalizedItems[itemIndex];

        if (item.type === "material") {
          const material = await MaterialModel.findOne({
            _id: item.referenceId,
            organizationId,
          });

          if (!material) {
            throw AppError.notFound(
              `Material not found or inactive for item at index ${itemIndex}`,
            );
          }
          continue;
        }

        const pkg = await Package.findOne({
          _id: item.referenceId,
          organizationId,
          $or: [{ status: "active" }, { isActive: true }],
        });

        if (!pkg) {
          throw AppError.notFound(
            `Package not found or inactive for item at index ${itemIndex}`,
          );
        }
      }

      // Check date validity
      const startDate = new Date(req.body.startDate);
      const endDate = new Date(req.body.endDate);
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
        items: normalizedItems,
        organizationId,
        createdBy: user.id,
        status: "pending",
      });

      const populatedRequest = await LoanRequest.findById(request._id).populate(
        "customerId",
        "email name",
      );

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
 * POST /api/v1/requests/:id/assign-materials
 * Assigns material instances and marks request as ready in one transactional operation.
 */
requestRouter.post(
  "/:id/assign-materials",
  requirePermission("requests:assign"),
  validateBody(assignMaterialsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    const session = await LoanRequest.startSession();

    try {
      const organizationId = getOrgId(req);
      const user = getAuthUser(req);
      const { assignments } = req.body as z.infer<typeof assignMaterialsSchema>;

      const materialInstanceIds = assignments.map((assignment) =>
        new Types.ObjectId(assignment.materialInstanceId).toString(),
      );

      const duplicatedInstanceIds = materialInstanceIds.filter(
        (id, index, ids) => ids.indexOf(id) !== index,
      );

      if (duplicatedInstanceIds.length > 0) {
        throw AppError.badRequest("Duplicated materialInstanceId in assignments");
      }

      let updatedRequest: Awaited<ReturnType<typeof LoanRequest.findById>> | null = null;

      await session.withTransaction(async () => {
        const request = await LoanRequest.findOne(
          {
            _id: req.params.id,
            organizationId,
            status: "approved",
          },
          null,
          { session },
        );

        if (!request) {
          const existingRequest = await LoanRequest.findOne(
            {
              _id: req.params.id,
              organizationId,
            },
            null,
            { session },
          );

          if (!existingRequest) {
            throw AppError.notFound("Request not found");
          }

          throw AppError.conflict(
            `Request is not in a valid status to prepare. Current status: ${existingRequest.status}`,
          );
        }

        const mappedAssignments = mapAssignmentsToRequestItemIndexes(
          request,
          assignments,
        );

        const instances = await MaterialInstance.find(
          {
            _id: {
              $in: mappedAssignments.map((assignment) => assignment.materialInstanceId),
            },
            organizationId,
          },
          null,
          { session },
        );

        if (instances.length !== mappedAssignments.length) {
          throw AppError.notFound(
            "One or more material instances do not exist in this organization",
          );
        }

        const instancesById = new Map(
          instances.map((instance) => [
            new Types.ObjectId(instance._id).toString(),
            instance,
          ]),
        );

        for (const [i, assignment] of mappedAssignments.entries()) {
          const assignmentInput = assignments[i];

          if (!assignmentInput) {
            throw AppError.badRequest(
              `Invalid assignment payload at index ${i}`,
            );
          }

          const instance = instancesById.get(
            new Types.ObjectId(assignment.materialInstanceId).toString(),
          );

          if (!instance) {
            throw AppError.notFound(
              `Material instance not found for assignment at index ${i}`,
            );
          }

          const assignmentTypeId = new Types.ObjectId(assignmentInput.materialTypeId).toString();
          const instanceTypeId = new Types.ObjectId(instance.modelId).toString();

          if (assignmentTypeId !== instanceTypeId) {
            throw AppError.badRequest(
              `materialTypeId does not match the selected material instance at index ${i}`,
            );
          }
        }

        const updateInstancesResult = await MaterialInstance.updateMany(
          {
            _id: {
              $in: mappedAssignments.map((assignment) => assignment.materialInstanceId),
            },
            organizationId,
            status: "available",
          },
          {
            $set: {
              status: "reserved",
            },
          },
          {
            session,
          },
        );

        if (updateInstancesResult.modifiedCount !== mappedAssignments.length) {
          throw AppError.conflict(
            "One or more material instances are not available",
          );
        }

        request.assignedMaterials =
          mappedAssignments as unknown as LoanRequestDocument["assignedMaterials"];
        request.assignedBy = new Types.ObjectId(user.id);
        request.assignedAt = new Date();
        request.status = "ready";

        await request.save({ session });

        updatedRequest = await LoanRequest.findById(request._id, null, {
          session,
        })
          .populate("customerId", "email name phone address")
          .populate(
            "assignedMaterials.materialInstanceId",
            "serialNumber status modelId",
          );
      });

      res.json({
        status: "success",
        data: { request: updatedRequest },
        message: "Materials assigned and request marked as ready",
      });
    } catch (err) {
      next(err);
    } finally {
      await session.endSession();
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
      });

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
