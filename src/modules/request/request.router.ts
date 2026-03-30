import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { MaterialInstance } from "../material/models/material_instance.model.ts";
import {
  LoanRequest,
  type LoanRequestDocument,
  LoanRequestZodSchema,
  requestStatusOptions,
} from "./models/request.model.ts";
import { requestService } from "./request.service.ts";
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

const createRequestSchema = LoanRequestZodSchema.pick({
  customerId: true,
  startDate: true,
  endDate: true,
  notes: true,
  depositDueDate: true,
})
  .extend({
    items: z
      .array(createRequestItemSchema)
      .min(1, "At least one item is required"),
    depositAmount: z.number().min(0),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "End date must be after start date",
    path: ["endDate"],
  })
  .refine(
    (data) => {
      if (!data.depositDueDate) return true;
      return data.depositDueDate <= data.startDate;
    },
    {
      message: "Deposit due date cannot be after start date",
      path: ["depositDueDate"],
    },
  );

const assignMaterialsSchema = z.object({
  assignments: z
    .array(
      z.object({
        materialTypeId: z
          .string()
          .refine((val) => Types.ObjectId.isValid(val), {
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

type AssignmentInput = z.infer<
  typeof assignMaterialsSchema
>["assignments"][number];

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
    const materialTypeId = new Types.ObjectId(
      assignment.materialTypeId,
    ).toString();
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
      const query = req.query as any;

      const result = await requestService.listRequests(organizationId, query);

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
 * GET /api/v1/requests/:id
 * Gets a specific request by ID.
 */
requestRouter.get(
  "/:id",
  requirePermission("requests:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const requestId = req.params.id;

      if (typeof requestId !== "string") {
        throw AppError.badRequest("Invalid request ID");
      }

      const request = await requestService.getRequestById(
        requestId,
        organizationId,
      );

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
 * GET /api/v1/requests/:id/available-materials
 * Returns material instances that can fulfil the request's needs,
 * split by user-accessible locations. Each instance includes an
 * `availability` tag: "available" (free now) or "upcoming" (will be
 * free before the request's start date).
 * Requires: requests:read
 */
requestRouter.get(
  "/:id/available-materials",
  requirePermission("requests:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const user = getAuthUser(req);
      const requestId = req.params.id;

      if (typeof requestId !== "string") {
        throw AppError.badRequest("Invalid request ID");
      }

      const result = await requestService.getAvailableMaterials(
        requestId,
        organizationId,
        user.id,
      );

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

      const request = await requestService.createRequest(
        organizationId,
        user.id,
        req.body,
      );

      res.status(201).json({
        status: "success",
        data: { request },
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
      const organizationId = getOrgId(req);
      const user = getAuthUser(req);
      const requestId = req.params.id;

      if (typeof requestId !== "string") {
        throw AppError.badRequest("Invalid request ID");
      }

      const request = await requestService.approveRequest(
        requestId,
        organizationId,
        user.id,
        req.body.notes,
      );

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
      const organizationId = getOrgId(req);
      const requestId = req.params.id;

      if (typeof requestId !== "string") {
        throw AppError.badRequest("Invalid request ID");
      }

      const request = await requestService.rejectRequest(
        requestId,
        organizationId,
        req.body.reason,
      );

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
        throw AppError.badRequest(
          "Duplicated materialInstanceId in assignments",
        );
      }

      let updatedRequest: Awaited<
        ReturnType<typeof LoanRequest.findById>
      > | null = null;

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
              $in: mappedAssignments.map(
                (assignment) => assignment.materialInstanceId,
              ),
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

          const assignmentTypeId = new Types.ObjectId(
            assignmentInput.materialTypeId,
          ).toString();
          const instanceTypeId = new Types.ObjectId(
            instance.modelId,
          ).toString();

          if (assignmentTypeId !== instanceTypeId) {
            throw AppError.badRequest(
              `materialTypeId does not match the selected material instance at index ${i}`,
            );
          }
        }

        const updateInstancesResult = await MaterialInstance.updateMany(
          {
            _id: {
              $in: mappedAssignments.map(
                (assignment) => assignment.materialInstanceId,
              ),
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
      const organizationId = getOrgId(req);
      const requestId = req.params.id;

      if (typeof requestId !== "string") {
        throw AppError.badRequest("Invalid request ID");
      }

      const request = await requestService.assignMaterials(
        requestId,
        organizationId,
        req.body.assignments,
      );

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
      const organizationId = getOrgId(req);
      const requestId = req.params.id;

      if (typeof requestId !== "string") {
        throw AppError.badRequest("Invalid request ID");
      }

      const request = await requestService.markAsReady(
        requestId,
        organizationId,
      );

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
 * POST /api/v1/requests/:id/record-payment
 * Records the deposit payment for a request (manual confirmation).
 * Use when payment is made outside of Stripe (e.g., cash, bank transfer).
 * Requires: requests:update
 */
requestRouter.post(
  "/:id/record-payment",
  requirePermission("requests:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const requestId = req.params.id;

      if (typeof requestId !== "string") {
        throw AppError.badRequest("Invalid request ID");
      }

      const request = await requestService.recordDepositPayment(
        requestId,
        organizationId,
      );

      res.json({
        status: "success",
        data: { request },
        message: "Deposit payment recorded successfully",
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
      const organizationId = getOrgId(req);
      const requestId = req.params.id;

      if (typeof requestId !== "string") {
        throw AppError.badRequest("Invalid request ID");
      }

      const request = await requestService.cancelRequest(
        requestId,
        organizationId,
      );

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
