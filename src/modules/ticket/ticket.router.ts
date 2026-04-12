import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { ticketService } from "./ticket.service.ts";
import { validateBody, validateQuery } from "../../middleware/validation.ts";
import {
  authenticate,
  requirePermission,
  getOrgId,
  getUserId,
} from "../../middleware/auth.ts";
import {
  createTicketBodySchema,
  listTicketsQuerySchema,
  resolveTicketBodySchema,
  rejectTicketBodySchema,
  capableUsersQuerySchema,
  createTransferFromTicketSchema,
} from "./ticket.schemas.ts";

const ticketRouter = Router();

// All ticket routes require authentication
ticketRouter.use(authenticate);

/**
 * POST /tickets
 * Crea un nuevo ticket (solicitud interna).
 * Requiere: tickets:create
 */
ticketRouter.post(
  "/",
  requirePermission("tickets:create"),
  validateBody(createTicketBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await ticketService.createTicket(
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
 * GET /tickets
 * Lista tickets propios (creados o asignados al usuario autenticado).
 * Requiere: tickets:read
 */
ticketRouter.get(
  "/",
  requirePermission("tickets:read"),
  validateQuery(listTicketsQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await ticketService.listTickets(
        getOrgId(req),
        getUserId(req),
        (req as any).query,
      );
      res.status(200).json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /tickets/capable-users?type=...&locationId=...
 * Devuelve los usuarios activos en una sede cuyo rol incluye el permiso
 * de dominio necesario para satisfacer un tipo de solicitud dado.
 * No requiere un ticket existente.
 * Requiere: tickets:read
 */
ticketRouter.get(
  "/capable-users",
  requirePermission("tickets:read"),
  validateQuery(capableUsersQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type, locationId } = (req as any).query;
      const data = await ticketService.findCapableUsersByQuery(
        getOrgId(req),
        getUserId(req),
        type,
        locationId,
      );
      res.status(200).json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /tickets/:id
 * Obtiene un ticket por ID. Solo visible para el creador o destinatario.
 * Requiere: tickets:read
 */
ticketRouter.get(
  "/:id",
  requirePermission("tickets:read"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const data = await ticketService.getTicketById(
        getOrgId(req),
        getUserId(req),
        req.params.id,
      );
      res.status(200).json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /tickets/:id/review
 * Marca un ticket como en revisión.
 * Requiere: tickets:review
 */
ticketRouter.patch(
  "/:id/review",
  requirePermission("tickets:review"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const data = await ticketService.reviewTicket(
        getOrgId(req),
        getUserId(req),
        req.params.id,
      );
      res.status(200).json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /tickets/:id/approve
 * Aprueba un ticket. Nota de resolución opcional.
 * Requiere: tickets:approve
 */
ticketRouter.patch(
  "/:id/approve",
  requirePermission("tickets:approve"),
  validateBody(resolveTicketBodySchema),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const data = await ticketService.approveTicket(
        getOrgId(req),
        getUserId(req),
        req.params.id,
        req.body.resolutionNote,
      );
      res.status(200).json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /tickets/:id/reject
 * Rechaza un ticket. Nota de resolución requerida.
 * Requiere: tickets:reject
 */
ticketRouter.patch(
  "/:id/reject",
  requirePermission("tickets:reject"),
  validateBody(rejectTicketBodySchema),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const data = await ticketService.rejectTicket(
        getOrgId(req),
        getUserId(req),
        req.params.id,
        req.body.resolutionNote,
      );
      res.status(200).json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /tickets/:id/cancel
 * Cancela un ticket. Solo el creador puede cancelar.
 * Requiere: tickets:cancel
 */
ticketRouter.patch(
  "/:id/cancel",
  requirePermission("tickets:cancel"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const data = await ticketService.cancelTicket(
        getOrgId(req),
        getUserId(req),
        req.params.id,
      );
      res.status(200).json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /tickets/:id/capable-users
 * Devuelve los usuarios activos de la sede del ticket cuyo rol incluye el
 * permiso de dominio requerido para satisfacer el tipo de solicitud.
 * Solo el creador o destinatario del ticket puede consultar este endpoint.
 * Requiere: tickets:read
 */
ticketRouter.get(
  "/:id/capable-users",
  requirePermission("tickets:read"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const data = await ticketService.getCapableUsers(
        getOrgId(req),
        getUserId(req),
        req.params.id,
      );
      res.status(200).json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /tickets/:id/fulfillment-options
 * Devuelve las sedes que pueden suplir todos los items solicitados en un ticket
 * de tipo transfer_request.
 * Requiere: transfers:create
 */
ticketRouter.get(
  "/:id/fulfillment-options",
  requirePermission("transfers:create"),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const data = await ticketService.getFulfillmentOptions(
        getOrgId(req),
        getUserId(req),
        req.params.id,
      );
      res.status(200).json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /tickets/:id/create-transfer
 * Genera automáticamente una solicitud de transferencia basada en un ticket
 * (tipo transfer_request) aprobado.
 * Requiere: transfers:create
 */
ticketRouter.post(
  "/:id/create-transfer",
  requirePermission("transfers:create"),
  validateBody(createTransferFromTicketSchema),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const data = await ticketService.generateTransferFromTicket(
        getOrgId(req),
        getUserId(req),
        req.params.id,
        req.body.fromLocationId,
        req.body.notes,
      );
      res.status(201).json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  },
);

export default ticketRouter;
