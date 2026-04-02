import { Types, type ClientSession } from "mongoose";
import {
  Incident,
  type IncidentDocument,
  type IncidentType,
  type IncidentSeverity,
  type IncidentSourceType,
  type IncidentContext,
} from "./models/incident.model.ts";
import { Loan } from "../loan/models/loan.model.ts";
import { Location } from "../location/models/location.model.ts";
import { AppError } from "../../errors/AppError.ts";
import {
  validateTransition,
  INCIDENT_TRANSITIONS,
} from "../shared/state_machine.ts";

/* ---------- Types ---------- */

interface CreateIncidentParams {
  organizationId: string | Types.ObjectId;
  loanId?: string | Types.ObjectId;
  locationId?: string | Types.ObjectId;
  context: IncidentContext;
  type: IncidentType;
  createdBy: string | Types.ObjectId;
  sourceType: IncidentSourceType;
  sourceId?: string | Types.ObjectId | undefined;
  severity?: IncidentSeverity | undefined;
  relatedMaterialInstances?: (string | Types.ObjectId)[] | undefined;
  description?: string | undefined;
  financialImpact?:
    | {
        estimated?: number | undefined;
        actual?: number | undefined;
        currency?: string | undefined;
      }
    | undefined;
  metadata?: Record<string, unknown> | undefined;
  session?: ClientSession | undefined;
}

interface ListIncidentsQuery {
  page?: number;
  limit?: number;
  loanId?: string;
  locationId?: string;
  context?: string;
  type?: string;
  status?: string;
  severity?: string;
  sourceType?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/* ---------- Internal Helpers ---------- */

function transitionIncidentStatus(
  incident: IncidentDocument & { status: string },
  nextStatus: string,
): void {
  validateTransition(incident.status, nextStatus, INCIDENT_TRANSITIONS);
  incident.status = nextStatus as any;
}

/* ---------- Service ---------- */

export const incidentService = {
  /**
   * Creates a new incident. Idempotent when sourceId is provided —
   * returns the existing incident if a duplicate is found.
   */
  async createIncident(params: CreateIncidentParams) {
    const {
      organizationId,
      loanId,
      locationId,
      context,
      type,
      createdBy,
      sourceType,
      sourceId,
      severity,
      relatedMaterialInstances,
      description,
      financialImpact,
      metadata,
      session,
    } = params;

    // Validate loan exists when loanId is provided
    if (loanId) {
      const loanQuery = Loan.findOne({ _id: loanId, organizationId });
      if (session) loanQuery.session(session);
      const loan = await loanQuery;

      if (!loan) {
        throw AppError.notFound("Loan not found in this organization");
      }
    }

    // Validate location exists when locationId is provided
    if (locationId) {
      const locationQuery = Location.findOne({ _id: locationId, organizationId });
      if (session) locationQuery.session(session);
      const location = await locationQuery;

      if (!location) {
        throw AppError.notFound("Location not found in this organization");
      }
    }

    // Idempotency check when sourceId is provided
    if (sourceId) {
      const existingQuery = Incident.findOne({ organizationId, sourceType, sourceId, type });
      if (session) existingQuery.session(session);
      const existing = await existingQuery;
      if (existing) {
        return existing;
      }
    }

    const createPayload: Record<string, unknown> = {
      organizationId,
      context,
      type,
      sourceType,
      createdBy: new Types.ObjectId(String(createdBy)),
    };

    if (loanId) createPayload.loanId = new Types.ObjectId(String(loanId));
    if (locationId) createPayload.locationId = new Types.ObjectId(String(locationId));

    if (sourceId) createPayload.sourceId = new Types.ObjectId(String(sourceId));
    if (severity) createPayload.severity = severity;
    if (description) createPayload.description = description;
    if (financialImpact) createPayload.financialImpact = financialImpact;
    if (metadata) createPayload.metadata = metadata;
    if (relatedMaterialInstances && relatedMaterialInstances.length > 0) {
      createPayload.relatedMaterialInstances = relatedMaterialInstances.map(
        (id) => new Types.ObjectId(String(id)),
      );
    }

    const [incident] = await (Incident as any).create([createPayload], {
      session: session ?? undefined,
    });

    return incident;
  },

  /**
   * Lists incidents for an organization with optional filters.
   */
  async listIncidents(
    organizationId: string | Types.ObjectId,
    query: ListIncidentsQuery,
  ) {
    const {
      page = 1,
      limit = 20,
      loanId,
      locationId,
      context,
      type,
      status,
      severity,
      sourceType,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = query;

    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = { organizationId };

    if (loanId) filter.loanId = loanId;
    if (locationId) filter.locationId = locationId;
    if (context) filter.context = context;
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (sourceType) filter.sourceType = sourceType;

    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const [incidents, total] = await Promise.all([
      Incident.find(filter)
        .skip(skip)
        .limit(limit)
        .populate("loanId", "customerId startDate endDate status")
        .populate("locationId", "name city status")
        .populate("createdBy", "email profile.firstName")
        .populate("resolvedBy", "email profile.firstName")
        .populate("relatedMaterialInstances", "serialNumber modelId")
        .sort({ [sortBy]: sortDirection }),
      Incident.countDocuments(filter),
    ]);

    return {
      incidents,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Gets a single incident by ID.
   */
  async getIncidentById(
    incidentId: string,
    organizationId: string | Types.ObjectId,
  ) {
    const incident = await Incident.findOne({
      _id: incidentId,
      organizationId,
    })
      .populate("loanId", "customerId startDate endDate status")
      .populate("locationId", "name city status")
      .populate("createdBy", "email profile.firstName")
      .populate("resolvedBy", "email profile.firstName")
      .populate("relatedMaterialInstances", "serialNumber modelId status");

    if (!incident) {
      throw AppError.notFound("Incident not found");
    }

    return incident;
  },

  /**
   * Acknowledges an open incident.
   */
  async acknowledgeIncident(
    incidentId: string,
    organizationId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
  ) {
    const incident = await Incident.findOne({
      _id: incidentId,
      organizationId,
    });

    if (!incident) {
      throw AppError.notFound("Incident not found");
    }

    transitionIncidentStatus(incident, "acknowledged");
    await incident.save();

    return incident;
  },

  /**
   * Resolves an incident with a resolution description.
   */
  async resolveIncident(
    incidentId: string,
    organizationId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    resolution: string,
  ) {
    const incident = await Incident.findOne({
      _id: incidentId,
      organizationId,
    });

    if (!incident) {
      throw AppError.notFound("Incident not found");
    }

    transitionIncidentStatus(incident, "resolved");
    incident.resolution = resolution;
    incident.resolvedAt = new Date();
    incident.resolvedBy = new Types.ObjectId(String(userId));
    await incident.save();

    return incident;
  },

  /**
   * Dismisses an incident with an optional resolution note.
   */
  async dismissIncident(
    incidentId: string,
    organizationId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    resolution?: string,
  ) {
    const incident = await Incident.findOne({
      _id: incidentId,
      organizationId,
    });

    if (!incident) {
      throw AppError.notFound("Incident not found");
    }

    transitionIncidentStatus(incident, "dismissed");
    if (resolution) {
      incident.resolution = resolution;
    }
    incident.resolvedAt = new Date();
    incident.resolvedBy = new Types.ObjectId(String(userId));
    await incident.save();

    return incident;
  },
};
