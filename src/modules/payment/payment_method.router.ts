import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { Types } from "mongoose";
import {
  authenticate,
  requireActiveOrganization,
  requirePermission,
  getOrgId,
} from "../../middleware/auth.ts";
import { validateBody, validateParams } from "../../middleware/validation.ts";
import { PaymentMethodZodSchema } from "./models/payment_method.model.ts";
import { paymentMethodService } from "./payment_method.service.ts";

const paymentMethodRouter = Router();

// All routes require authentication and active organization
paymentMethodRouter.use(authenticate, requireActiveOrganization);

const idParamSchema = z.object({
  id: z.string().refine((v) => Types.ObjectId.isValid(v), {
    message: "Invalid payment method ID",
  }),
});

/**
 * GET /api/v1/payment-methods
 * Lists all active payment methods for the organization.
 * Requires: payment_methods:read
 */
paymentMethodRouter.get(
  "/",
  requirePermission("payment_methods:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const methods =
        await paymentMethodService.listPaymentMethods(organizationId);
      res.json({ status: "success", data: { paymentMethods: methods } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/payment-methods
 * Creates a new payment method for the organization.
 * Requires: payment_methods:create
 */
paymentMethodRouter.post(
  "/",
  requirePermission("payment_methods:create"),
  validateBody(PaymentMethodZodSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const method = await paymentMethodService.createPaymentMethod(
        organizationId,
        req.body,
      );
      res
        .status(201)
        .json({ status: "success", data: { paymentMethod: method } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/payment-methods/:id
 * Updates a payment method. Default methods cannot have their name changed.
 * Requires: payment_methods:update
 */
paymentMethodRouter.patch(
  "/:id",
  requirePermission("payment_methods:update"),
  validateParams(idParamSchema),
  validateBody(PaymentMethodZodSchema.partial()),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const method = await paymentMethodService.updatePaymentMethod(
        String(req.params.id),
        organizationId,
        req.body,
      );
      res.json({ status: "success", data: { paymentMethod: method } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/payment-methods/:id
 * Deactivates a payment method (soft delete).
 * Requires: payment_methods:delete
 */
paymentMethodRouter.delete(
  "/:id",
  requirePermission("payment_methods:delete"),
  validateParams(idParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const result = await paymentMethodService.deactivatePaymentMethod(
        String(req.params.id),
        organizationId,
      );
      res.json({ status: "success", data: result });
    } catch (err) {
      next(err);
    }
  },
);

export default paymentMethodRouter;
