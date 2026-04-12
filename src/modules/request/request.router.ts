import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { Types } from "mongoose";
import {
  LoanRequestBaseZodSchema,
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
      message: "Formato de ID de cliente no válido",
    })
    .optional(),
  packageId: z
    .string()
    .refine((val) => Types.ObjectId.isValid(val), {
      message: "Formato de ID de paquete no válido",
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

const createRequestSchema = LoanRequestBaseZodSchema.pick({
  customerId: true,
  startDate: true,
  endDate: true,
  notes: true,
  depositDueDate: true,
})
  .extend({
    items: z
      .array(createRequestItemSchema)
      .min(1, "Se requiere al menos un artículo"),
    depositAmount: z
      .number()
      .positive("El monto del depósito debe ser mayor a cero"),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "La fecha de fin debe ser posterior a la fecha de inicio",
    path: ["endDate"],
  })
  .refine(
    (data) => {
      if (!data.depositDueDate) return true;
      return data.depositDueDate >= data.startDate;
    },
    {
      message:
        "La fecha de vencimiento del depósito no puede ser anterior a la fecha de inicio",
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
            message: "Formato de ID de tipo de material no válido",
          }),
        materialInstanceId: z
          .string()
          .refine((val) => Types.ObjectId.isValid(val), {
            message: "Formato de ID de instancia de material no válido",
          }),
      }),
    )
    .min(1, "Se requiere al menos una asignación"),
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
      const user = getAuthUser(req);
      const query = req.query as any;

      const result = await requestService.listRequests(
        organizationId,
        user.id,
        query,
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
 * GET /api/v1/requests/:id
 * Gets a specific request by ID.
 */
requestRouter.get(
  "/:id",
  requirePermission("requests:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const user = getAuthUser(req);
      const requestId = req.params.id;

      if (typeof requestId !== "string") {
        throw AppError.badRequest("ID de solicitud no válido");
      }

      const request = await requestService.getRequestById(
        requestId,
        organizationId,
        user.id,
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
 * split by user-accessible locations. Only instances with status
 * "available" are returned. Each instance includes an
 * `availability` field set to "available".
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
        throw AppError.badRequest("ID de solicitud no válido");
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
 * Approves a pending request (Warehouse Operator action).
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
        throw AppError.badRequest("ID de solicitud no válido");
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
        message: "Solicitud aprobada exitosamente",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/requests/:id/reject
 * Rejects a pending request (Warehouse Operator action).
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
        throw AppError.badRequest("ID de solicitud no válido");
      }

      const request = await requestService.rejectRequest(
        requestId,
        organizationId,
        req.body.reason,
      );

      res.json({
        status: "success",
        data: { request },
        message: "Solicitud rechazada",
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
    try {
      const organizationId = getOrgId(req);
      const user = getAuthUser(req);
      const { assignments } = req.body as z.infer<typeof assignMaterialsSchema>;

      const requestId = req.params.id;
      if (typeof requestId !== "string") {
        throw AppError.badRequest("ID de solicitud no válido");
      }

      const request = await requestService.assignMaterialsTransaction(
        requestId,
        organizationId,
        user.id,
        assignments,
      );

      res.json({
        status: "success",
        data: { request },
        message: "Materiales asignados y solicitud marcada como asignada",
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
  requirePermission("requests:ready"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const requestId = req.params.id;

      if (typeof requestId !== "string") {
        throw AppError.badRequest("ID de solicitud no válido");
      }

      const request = await requestService.markAsReady(
        requestId,
        organizationId,
      );

      res.json({
        status: "success",
        data: { request },
        message: "Solicitud lista para recolección",
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
        throw AppError.badRequest("ID de solicitud no válido");
      }

      const request = await requestService.recordDepositPayment(
        requestId,
        organizationId,
      );

      res.json({
        status: "success",
        data: { request },
        message: "Pago del depósito registrado exitosamente",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/requests/:id/record-rental-payment
 * Records the rental fee payment for a request (manual confirmation).
 * Use when payment is made outside of Stripe (e.g., cash, bank transfer).
 * Requires: requests:update
 */
requestRouter.post(
  "/:id/record-rental-payment",
  requirePermission("requests:update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const requestId = req.params.id;

      if (typeof requestId !== "string") {
        throw AppError.badRequest("ID de solicitud no válido");
      }

      const request = await requestService.recordRentalFeePayment(
        requestId,
        organizationId,
      );

      res.json({
        status: "success",
        data: { request },
        message: "Pago de la tarifa de alquiler registrado exitosamente",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/requests/:id/cancel
 * Cancels a request and releases assigned materials.
 * Requires: requests:cancel
 */
requestRouter.post(
  "/:id/cancel",
  requirePermission("requests:cancel"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const requestId = req.params.id;

      if (typeof requestId !== "string") {
        throw AppError.badRequest("ID de solicitud no válido");
      }

      const request = await requestService.cancelRequest(
        requestId,
        organizationId,
      );

      res.json({
        status: "success",
        data: { request },
        message: "Solicitud cancelada exitosamente",
      });
    } catch (err) {
      next(err);
    }
  },
);

export default requestRouter;
