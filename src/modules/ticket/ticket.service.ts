import { AppError } from "../../errors/AppError.ts";
import { Ticket } from "./models/ticket.model.ts";
import { User } from "../user/models/user.model.ts";
import { Location } from "../location/models/location.model.ts";
import { Role } from "../roles/models/role.model.ts";
import { Types } from "mongoose";
import {
  validateTransition,
  TICKET_TRANSITIONS,
} from "../shared/state_machine.ts";
import {
  payloadSchemasByType,
  type CreateTicketBody,
  type ListTicketsQuery,
} from "./ticket.schemas.ts";

/**
 * Maps each ticket type to the domain-specific permission that a user needs
 * in order to *fulfill* the requested action (e.g., actually create the
 * transfer, start the maintenance batch, etc.).
 */
const TICKET_TYPE_DOMAIN_PERMISSION: Record<string, string> = {
  transfer_request: "transfers:create",
  incident_report: "incidents:create",
  maintenance_request: "maintenance:create",
  inspection_request: "inspections:create",
  generic: "tickets:approve",
};

class TicketService {
  /* ------------------------------------------------------------------ */
  /*  Create                                                             */
  /* ------------------------------------------------------------------ */

  async createTicket(
    organizationId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    data: CreateTicketBody,
  ) {
    // Validate location exists and belongs to the org
    const location = await Location.findOne({
      _id: data.locationId,
      organizationId,
      isActive: true,
    });
    if (!location) {
      throw AppError.notFound("Ubicación no encontrada o inactiva");
    }

    // Validate creator belongs to the location
    const creator = await User.findOne({ _id: userId, organizationId });
    if (!creator) throw AppError.notFound("Usuario no encontrado");

    const creatorBelongsToLocation = creator.locations?.some(
      (loc) => loc.toString() === data.locationId,
    );
    if (!creatorBelongsToLocation) {
      throw AppError.forbidden(
        "Solo puedes crear tickets en sedes a las que estés asignado",
      );
    }

    // Validate assignee belongs to the same location (if provided)
    if (data.assigneeId) {
      const assignee = await User.findOne({
        _id: data.assigneeId,
        organizationId,
      });
      if (!assignee) {
        throw AppError.notFound("Destinatario no encontrado");
      }
      const assigneeBelongsToLocation = assignee.locations?.some(
        (loc) => loc.toString() === data.locationId,
      );
      if (!assigneeBelongsToLocation) {
        throw AppError.badRequest(
          "El destinatario debe pertenecer a la misma sede del ticket",
        );
      }
    }

    // Validate responseDeadline is in the future
    if (data.responseDeadline) {
      const deadline = new Date(data.responseDeadline);
      if (deadline <= new Date()) {
        throw AppError.badRequest(
          "La fecha límite de respuesta debe ser una fecha futura",
        );
      }
    }

    // Validate payload against the type-specific schema
    const payloadSchema = payloadSchemasByType[data.type];
    if (!payloadSchema) {
      throw AppError.badRequest(`Tipo de ticket no soportado: ${data.type}`);
    }
    const payloadResult = payloadSchema.safeParse(data.payload);
    if (!payloadResult.success) {
      throw AppError.badRequest("Datos del payload no válidos", {
        errors: payloadResult.error.flatten().fieldErrors,
      });
    }

    const ticket = await Ticket.create({
      organizationId,
      locationId: data.locationId,
      type: data.type,
      title: data.title,
      ...(data.description !== undefined && { description: data.description }),
      createdBy: userId,
      ...(data.assigneeId && { assigneeId: data.assigneeId }),
      ...(data.responseDeadline && {
        responseDeadline: new Date(data.responseDeadline),
      }),
      payload: payloadResult.data,
    });

    return ticket.toObject();
  }

  /* ------------------------------------------------------------------ */
  /*  List                                                               */
  /* ------------------------------------------------------------------ */

  async listTickets(
    organizationId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    filters: ListTicketsQuery,
  ) {
    const { page = 1, limit = 20, status, type, locationId } = filters;
    const skip = (page - 1) * limit;

    // Expire overdue tickets lazily before listing
    await this.expireOverdueTickets(organizationId);

    const query: Record<string, unknown> = {
      organizationId,
      $or: [{ createdBy: userId }, { assigneeId: userId }],
    };
    if (status) query.status = status;
    if (type) query.type = type;
    if (locationId) query.locationId = locationId;

    const [tickets, total] = await Promise.all([
      Ticket.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("createdBy", "name email")
        .populate("assigneeId", "name email")
        .populate("reviewedBy", "name email")
        .populate("locationId", "name code")
        .lean(),
      Ticket.countDocuments(query),
    ]);

    return {
      tickets,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Get by ID                                                          */
  /* ------------------------------------------------------------------ */

  async getTicketById(
    organizationId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    ticketId: string,
  ) {
    if (!Types.ObjectId.isValid(ticketId)) {
      throw AppError.badRequest("Formato de ID de ticket no válido");
    }

    const ticket = await Ticket.findOne({
      _id: ticketId,
      organizationId,
    })
      .populate("createdBy", "name email")
      .populate("assigneeId", "name email")
      .populate("reviewedBy", "name email")
      .populate("locationId", "name code")
      .lean();

    if (!ticket) {
      throw AppError.notFound("Ticket no encontrado");
    }

    // Only creator or assignee can view
    const userIdStr = userId.toString();
    const isCreator = ticket.createdBy?._id?.toString() === userIdStr;
    const isAssignee = ticket.assigneeId?._id?.toString() === userIdStr;

    if (!isCreator && !isAssignee) {
      throw AppError.notFound("Ticket no encontrado");
    }

    return ticket;
  }

  /* ------------------------------------------------------------------ */
  /*  Status Transitions                                                 */
  /* ------------------------------------------------------------------ */

  async reviewTicket(
    organizationId: string | Types.ObjectId,
    reviewerId: string | Types.ObjectId,
    ticketId: string,
  ) {
    const ticket = await this.findTicketForReview(
      organizationId,
      reviewerId,
      ticketId,
    );
    validateTransition(ticket.status!, "in_review", TICKET_TRANSITIONS);

    ticket.status = "in_review";
    ticket.reviewedBy = new Types.ObjectId(reviewerId.toString());
    ticket.reviewedAt = new Date();
    await ticket.save();

    return ticket.toObject();
  }

  async approveTicket(
    organizationId: string | Types.ObjectId,
    reviewerId: string | Types.ObjectId,
    ticketId: string,
    resolutionNote?: string,
  ) {
    const ticket = await this.findTicketForReview(
      organizationId,
      reviewerId,
      ticketId,
    );
    validateTransition(ticket.status!, "approved", TICKET_TRANSITIONS);

    ticket.status = "approved";
    ticket.reviewedBy = new Types.ObjectId(reviewerId.toString());
    ticket.reviewedAt = new Date();
    if (resolutionNote !== undefined) ticket.resolutionNote = resolutionNote;
    await ticket.save();

    return ticket.toObject();
  }

  async rejectTicket(
    organizationId: string | Types.ObjectId,
    reviewerId: string | Types.ObjectId,
    ticketId: string,
    resolutionNote: string,
  ) {
    const ticket = await this.findTicketForReview(
      organizationId,
      reviewerId,
      ticketId,
    );
    validateTransition(ticket.status!, "rejected", TICKET_TRANSITIONS);

    ticket.status = "rejected";
    ticket.reviewedBy = new Types.ObjectId(reviewerId.toString());
    ticket.reviewedAt = new Date();
    ticket.resolutionNote = resolutionNote;
    await ticket.save();

    return ticket.toObject();
  }

  async cancelTicket(
    organizationId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    ticketId: string,
  ) {
    if (!Types.ObjectId.isValid(ticketId)) {
      throw AppError.badRequest("Formato de ID de ticket no válido");
    }

    const ticket = await Ticket.findOne({
      _id: ticketId,
      organizationId,
    });
    if (!ticket) throw AppError.notFound("Ticket no encontrado");

    // Only the creator can cancel
    if (ticket.createdBy.toString() !== userId.toString()) {
      throw AppError.forbidden("Solo el creador del ticket puede cancelarlo");
    }

    validateTransition(ticket.status!, "cancelled", TICKET_TRANSITIONS);

    ticket.status = "cancelled";
    await ticket.save();

    return ticket.toObject();
  }

  /* ------------------------------------------------------------------ */
  /*  Bulk Cancel (location change integration)                          */
  /* ------------------------------------------------------------------ */

  async cancelTicketsByUserAndLocation(
    organizationId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    locationId: string | Types.ObjectId,
  ) {
    const result = await Ticket.updateMany(
      {
        organizationId,
        locationId,
        status: { $in: ["pending", "in_review"] },
        $or: [{ createdBy: userId }, { assigneeId: userId }],
      },
      {
        $set: { status: "cancelled" },
      },
    );
    return result.modifiedCount;
  }

  /* ------------------------------------------------------------------ */
  /*  Expiration                                                         */
  /* ------------------------------------------------------------------ */

  async expireOverdueTickets(organizationId?: string | Types.ObjectId) {
    const filter: Record<string, unknown> = {
      status: { $in: ["pending", "in_review"] },
      responseDeadline: { $lte: new Date() },
    };
    if (organizationId) filter.organizationId = organizationId;

    const result = await Ticket.updateMany(filter, {
      $set: { status: "expired" },
    });
    return result.modifiedCount;
  }

  /* ------------------------------------------------------------------ */
  /*  Private Helpers                                                     */
  /* ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------ */
  /*  Smart: Capable Users                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Returns the list of active users in the ticket's location whose role
   * includes the domain-specific permission required to fulfill the ticket
   * type (e.g. `transfers:create` for a transfer_request).
   *
   * Access is restricted to the ticket creator or assignee.
   */
  async getCapableUsers(
    organizationId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    ticketId: string,
  ) {
    if (!Types.ObjectId.isValid(ticketId)) {
      throw AppError.badRequest("Formato de ID de ticket no válido");
    }

    const ticket = await Ticket.findOne({
      _id: ticketId,
      organizationId,
    }).lean();

    if (!ticket) throw AppError.notFound("Ticket no encontrado");

    // Only the creator or assignee may query capable users
    const userIdStr = userId.toString();
    const isCreator = ticket.createdBy.toString() === userIdStr;
    const isAssignee = ticket.assigneeId?.toString() === userIdStr;
    if (!isCreator && !isAssignee) {
      throw AppError.notFound("Ticket no encontrado");
    }

    const requiredPermission = TICKET_TYPE_DOMAIN_PERMISSION[ticket.type];
    if (!requiredPermission) {
      throw AppError.internal(
        `Tipo de ticket sin mapeo de permiso: ${ticket.type}`,
      );
    }

    // Find all roles in this org whose permissions include the required one
    const eligibleRoles = await Role.find({
      organizationId,
      permissions: requiredPermission,
    })
      .select("_id name")
      .lean();

    if (eligibleRoles.length === 0) {
      return {
        users: [],
        requiredPermission,
        ticketType: ticket.type,
      };
    }

    const roleIdToName: Record<string, string> = {};
    const eligibleRoleIds: string[] = eligibleRoles.map((r) => {
      const id = r._id.toString();
      roleIdToName[id] = (r as { _id: unknown; name: string }).name;
      return id;
    });

    // Find active users assigned to the ticket's location with an eligible role,
    // excluding the ticket creator (they can't fulfill their own request)
    const users = await User.find({
      organizationId,
      locations: ticket.locationId,
      roleId: { $in: eligibleRoleIds },
      status: "active",
      _id: { $ne: ticket.createdBy },
    })
      .select("name email roleId")
      .lean();

    return {
      users: users.map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        roleId: u.roleId,
        roleName: roleIdToName[u.roleId] ?? null,
      })),
      requiredPermission,
      ticketType: ticket.type,
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Private Helpers                                                     */
  /* ------------------------------------------------------------------ */

  private async findTicketForReview(
    organizationId: string | Types.ObjectId,
    reviewerId: string | Types.ObjectId,
    ticketId: string,
  ) {
    if (!Types.ObjectId.isValid(ticketId)) {
      throw AppError.badRequest("Formato de ID de ticket no válido");
    }

    const ticket = await Ticket.findOne({
      _id: ticketId,
      organizationId,
    });
    if (!ticket) throw AppError.notFound("Ticket no encontrado");

    // Reviewer must be the assignee (if set) or belong to the same location
    const reviewer = await User.findOne({
      _id: reviewerId,
      organizationId,
    });
    if (!reviewer) throw AppError.notFound("Usuario revisor no encontrado");

    if (ticket.assigneeId) {
      if (ticket.assigneeId.toString() !== reviewerId.toString()) {
        throw AppError.forbidden(
          "Solo el destinatario asignado puede revisar este ticket",
        );
      }
    } else {
      const reviewerBelongsToLocation = reviewer.locations?.some(
        (loc) => loc.toString() === ticket.locationId.toString(),
      );
      if (!reviewerBelongsToLocation) {
        throw AppError.forbidden(
          "Debes pertenecer a la sede del ticket para revisarlo",
        );
      }
    }

    // Creator cannot review their own ticket
    if (ticket.createdBy.toString() === reviewerId.toString()) {
      throw AppError.forbidden("No puedes revisar tu propio ticket");
    }

    return ticket;
  }
}

export const ticketService = new TicketService();
