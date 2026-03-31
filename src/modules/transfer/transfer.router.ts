import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { transferService } from "./transfer.service.ts";
import { validateBody, validateQuery } from "../../middleware/validation.ts";
import {
  authenticate,
  requirePermission,
  getOrgId,
  getUserId,
} from "../../middleware/auth.ts";
import { TransferRequestZodSchema } from "./models/transfer_request.model.ts";
import {
  TransferZodSchema,
  ItemConditionEnum,
} from "./models/transfer.model.ts";
import { TransferRejectionReasonZodSchema } from "./models/transfer_rejection_reason.model.ts";
import { z } from "zod";
import { Types } from "mongoose";

const transferRouter = Router();

// All transfer routes require authentication
transferRouter.use(authenticate);

/**
 * ============================================================================
 * TRANSFER REQUEST ROUTES
 * ============================================================================
 */

/**
 * POST /transfers/requests
 * Create a new transfer request
 */
transferRouter.post(
  "/requests",
  requirePermission("transfers:create"),
  validateBody(TransferRequestZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await transferService.createRequest(
        getOrgId(req),
        getUserId(req),
        req.body,
      );
      res.status(201).json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

const listRequestsQuerySchema = z.object({
  status: z.enum(["requested", "approved", "rejected", "fulfilled"]).optional(),
  fulfilled: z
    .string()
    .optional()
    .transform((val) => val === "true"),
});

/**
 * GET /transfers/requests
 * List all transfer requests for organization
 * By default, excludes fulfilled requests unless fulfilled=true is provided
 */
transferRouter.get(
  "/requests",
  requirePermission("transfers:read"),
  validateQuery(listRequestsQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, fulfilled } = (req as any).query;
      const filters: any = {};
      if (status) {
        filters.status = status;
      } else if (!fulfilled) {
        // Exclude fulfilled requests by default
        filters.status = { $ne: "fulfilled" };
      }

      const data = await transferService.listRequests(getOrgId(req), filters);
      res.status(200).json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /transfers/requests/:id/respond
 * Approve, reject or cancel a request
 */
transferRouter.patch(
  "/requests/:id/respond",
  requirePermission("transfers:update"),
  validateBody(
    z.object({
      status: z.enum(["approved", "rejected"]),
      rejectionReasonId: z
        .string()
        .refine((val) => Types.ObjectId.isValid(val), "Invalid rejection reason ID")
        .optional(),
      rejectionNote: z.string().max(500).trim().optional(),
    }),
  ),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const data = await transferService.respondToRequest(
        getOrgId(req),
        getUserId(req),
        req.params.id,
        req.body.status,
        req.body.rejectionReasonId,
        req.body.rejectionNote,
      );
      res.status(200).json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * ============================================================================
 * TRANSFER (SHIPMENT) ROUTES
 * ============================================================================
 */

/**
 * POST /transfers
 * Initiate a physical transfer (shipment)
 */
transferRouter.post(
  "/",
  requirePermission("transfers:create"),
  validateBody(TransferZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await transferService.initiateTransfer(
        getOrgId(req),
        getUserId(req),
        req.body,
      );
      res.status(201).json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /transfers
 * List all transfers for organization
 */
transferRouter.get(
  "/",
  requirePermission("transfers:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status } = req.query;
      const filters: any = {};
      if (status) filters.status = status;

      const data = await transferService.listTransfers(getOrgId(req), filters);
      res.status(200).json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /transfers/:id
 * Get details for a specific transfer
 */
transferRouter.get(
  "/:id",
  requirePermission("transfers:read"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const data = await transferService.getTransferDetails(
        getOrgId(req),
        req.params.id,
      );
      res.status(200).json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /transfers/:id/receive
 * Mark a transfer as received
 */
transferRouter.patch(
  "/:id/receive",
  requirePermission("transfers:update"),
  validateBody(
    z.object({
      receiverNotes: z
        .string()
        .max(500, "Maximum 500 characters")
        .trim()
        .optional(),
      items: z
        .array(
          z.object({
            instanceId: z
              .string()
              .refine(
                (val) => Types.ObjectId.isValid(val),
                "Invalid Instance ID",
              ),
            receivedCondition: ItemConditionEnum,
          }),
        )
        .optional(),
    }),
  ),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const data = await transferService.receiveTransfer(
        getOrgId(req),
        getUserId(req),
        req.params.id,
        req.body.receiverNotes,
        req.body.items,
      );
      res.status(200).json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * ============================================================================
 * TRANSFER REJECTION REASON ROUTES
 * ============================================================================
 */

const listRejectionReasonsQuerySchema = z.object({
  includeInactive: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

/**
 * GET /transfers/rejection-reasons
 * List rejection reasons for the organization
 * Permission: transfers:read
 */
transferRouter.get(
  "/rejection-reasons",
  requirePermission("transfers:read"),
  validateQuery(listRejectionReasonsQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { includeInactive } = (req as any).query;
      const data = await transferService.listRejectionReasons(
        getOrgId(req),
        includeInactive,
      );
      res.status(200).json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /transfers/rejection-reasons
 * Create a new rejection reason
 * Permission: transfer_rejection_reasons:manage
 */
transferRouter.post(
  "/rejection-reasons",
  requirePermission("transfer_rejection_reasons:manage"),
  validateBody(TransferRejectionReasonZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await transferService.createRejectionReason(
        getOrgId(req),
        req.body,
      );
      res.status(201).json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /transfers/rejection-reasons/:id
 * Update a rejection reason
 * Permission: transfer_rejection_reasons:manage
 */
transferRouter.patch(
  "/rejection-reasons/:id",
  requirePermission("transfer_rejection_reasons:manage"),
  validateBody(TransferRejectionReasonZodSchema.partial()),
  async (
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const data = await transferService.updateRejectionReason(
        getOrgId(req),
        req.params.id,
        req.body,
      );
      res.status(200).json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /transfers/rejection-reasons/:id
 * Delete a rejection reason (default reasons are protected)
 * Permission: transfer_rejection_reasons:manage
 */
transferRouter.delete(
  "/rejection-reasons/:id",
  requirePermission("transfer_rejection_reasons:manage"),
  async (
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      await transferService.deleteRejectionReason(getOrgId(req), req.params.id);
      res.status(200).json({ status: "success", data: null });
    } catch (err) {
      next(err);
    }
  },
);

export default transferRouter;
