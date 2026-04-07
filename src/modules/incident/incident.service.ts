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
import {
  incidentTypeOnCreateToInstanceStatus,
  incidentTypeOnResolveToInstanceStatus,
} from "../shared/instance_status_mapper.ts";
import { materialService } from "../material/material.service.ts";
import { codeGenerationService } from "../code_scheme/code_generation.service.ts";
import { logger } from "../../utils/logger.ts";

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

const ACTIVE_INCIDENT_STATUSES = ["open", "acknowledged"] as const;

async function assertNoActiveIncidentMaterialConflict(params: {
  organizationId: string | Types.ObjectId;
  materialInstanceIds?: (string | Types.ObjectId)[] | undefined;
  excludeIncidentId?: string | Types.ObjectId | undefined;
  session?: ClientSession | undefined;
}) {
  const { organizationId, materialInstanceIds, excludeIncidentId, session } =
    params;

  if (!materialInstanceIds || materialInstanceIds.length === 0) {
    return;
  }

  const normalizedIds = Array.from(
    new Set(materialInstanceIds.map((id) => String(id))),
  ).map((id) => new Types.ObjectId(id));

  const filter: Record<string, unknown> = {
    organizationId,
    status: { $in: ACTIVE_INCIDENT_STATUSES },
    relatedMaterialInstances: { $in: normalizedIds },
  };

  if (excludeIncidentId) {
    filter._id = { $ne: new Types.ObjectId(String(excludeIncidentId)) };
  }

  const conflictQuery = Incident.findOne(filter)
    .select("_id type status relatedMaterialInstances")
    .lean();

  if (session) {
    conflictQuery.session(session);
  }

  const conflictingIncident = await conflictQuery;
  if (!conflictingIncident) {
    return;
  }

  throw AppError.conflict(
    "Una o más instancias de material ya están vinculadas a un incidente activo",
    {
      conflictingIncidentId: String(conflictingIncident._id),
      conflictingIncidentType: conflictingIncident.type,
      conflictingIncidentStatus: conflictingIncident.status,
    },
  );
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
        throw AppError.notFound("Préstamo no encontrado en esta organización");
      }
    }

    // Validate location exists when locationId is provided
    if (locationId) {
      const locationQuery = Location.findOne({
        _id: locationId,
        organizationId,
      });
      if (session) locationQuery.session(session);
      const location = await locationQuery;

      if (!location) {
        throw AppError.notFound("Ubicación no encontrada en esta organización");
      }
    }

    // Idempotency check when sourceId is provided
    if (sourceId) {
      const existingQuery = Incident.findOne({
        organizationId,
        sourceType,
        sourceId,
        type,
      });
      if (session) existingQuery.session(session);
      const existing = await existingQuery;
      if (existing) {
        return existing;
      }
    }

    await assertNoActiveIncidentMaterialConflict({
      organizationId,
      materialInstanceIds: relatedMaterialInstances,
      session,
    });

    const createPayload: Record<string, unknown> = {
      organizationId,
      context,
      type,
      sourceType,
      createdBy: new Types.ObjectId(String(createdBy)),
    };

    if (loanId) createPayload.loanId = new Types.ObjectId(String(loanId));
    if (locationId)
      createPayload.locationId = new Types.ObjectId(String(locationId));

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

    createPayload.incidentNumber = await codeGenerationService.generateCode({
      organizationId: String(organizationId),
      entityType: "incident",
      ...(session ? { session } : {}),
    });

    const [incident] = await (Incident as any).create([createPayload], {
      session: session ?? undefined,
    });

    // Transition related material instances based on the incident type
    const createTargetStatus = incidentTypeOnCreateToInstanceStatus(type);
    if (
      createTargetStatus &&
      relatedMaterialInstances &&
      relatedMaterialInstances.length > 0
    ) {
      for (const instanceId of relatedMaterialInstances) {
        try {
          await materialService.updateInstanceStatus(
            organizationId,
            String(instanceId),
            createTargetStatus,
            `Status updated by incident (${type})`,
            String(createdBy),
            "system",
          );
        } catch (err) {
          logger.warn(
            "Failed to transition material instance status on incident creation",
            {
              instanceId: String(instanceId),
              targetStatus: createTargetStatus,
              incidentType: type,
              error: err instanceof Error ? err.message : String(err),
            },
          );
        }
      }
    }

    return incident;
  },

  /**
   * Adds related material instances to an existing incident.
   */
  async addRelatedMaterialInstances(
    incidentId: string,
    organizationId: string | Types.ObjectId,
    userId: string | Types.ObjectId,
    materialInstanceIds: (string | Types.ObjectId)[],
    session?: ClientSession,
  ) {
    if (!materialInstanceIds.length) {
      throw AppError.badRequest(
        "Se requiere al menos una instancia de material",
      );
    }

    const incidentQuery = Incident.findOne({
      _id: incidentId,
      organizationId,
    });
    if (session) incidentQuery.session(session);
    const incident = await incidentQuery;

    if (!incident) {
      throw AppError.notFound("Incidente no encontrado");
    }

    await assertNoActiveIncidentMaterialConflict({
      organizationId,
      materialInstanceIds,
      excludeIncidentId: incident._id,
      session,
    });

    const existingIds = new Set(
      (
        (incident.relatedMaterialInstances as Types.ObjectId[] | undefined) ??
        []
      ).map((id) => String(id)),
    );
    const newIds = Array.from(
      new Set(materialInstanceIds.map((id) => String(id))),
    );

    for (const id of newIds) {
      if (!existingIds.has(id)) {
        incident.relatedMaterialInstances.push(new Types.ObjectId(id));
      }
    }

    if (session) {
      await incident.save({ session });
    } else {
      await incident.save();
    }

    const createTargetStatus = incidentTypeOnCreateToInstanceStatus(
      incident.type as IncidentType,
    );
    if (createTargetStatus) {
      for (const instanceId of newIds) {
        try {
          await materialService.updateInstanceStatus(
            organizationId,
            String(instanceId),
            createTargetStatus,
            `Status updated by incident (${incident.type})`,
            String(userId),
            "system",
          );
        } catch (err) {
          logger.warn(
            "Failed to transition material instance status on instance add",
            {
              instanceId: String(instanceId),
              targetStatus: createTargetStatus,
              incidentType: incident.type,
              error: err instanceof Error ? err.message : String(err),
            },
          );
        }
      }
    }

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
      throw AppError.notFound("Incidente no encontrado");
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
      throw AppError.notFound("Incidente no encontrado");
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
      throw AppError.notFound("Incidente no encontrado");
    }

    transitionIncidentStatus(incident, "resolved");
    incident.resolution = resolution;
    incident.resolvedAt = new Date();
    incident.resolvedBy = new Types.ObjectId(String(userId));
    await incident.save();

    // Transition related material instances back based on resolution
    const resolveTargetStatus = incidentTypeOnResolveToInstanceStatus(
      incident.type as IncidentType,
    );
    const resolveInstances = (incident as any).relatedMaterialInstances as
      | Types.ObjectId[]
      | undefined;
    if (
      resolveTargetStatus &&
      resolveInstances &&
      resolveInstances.length > 0
    ) {
      for (const instanceId of resolveInstances) {
        try {
          await materialService.updateInstanceStatus(
            incident.organizationId as Types.ObjectId,
            String(instanceId),
            resolveTargetStatus,
            `Status updated by incident resolution (${incident.type})`,
            String(userId),
            "system",
          );
        } catch (err) {
          logger.warn(
            "Failed to transition material instance status on incident resolution",
            {
              instanceId: String(instanceId),
              targetStatus: resolveTargetStatus,
              incidentType: incident.type,
              error: err instanceof Error ? err.message : String(err),
            },
          );
        }
      }
    }

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
      throw AppError.notFound("Incidente no encontrado");
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
