import type { IncidentType } from "../incident/models/incident.model.ts";

/**
 * Maps an inspection item's conditionAfter value to the target MaterialInstance
 * status that should be applied automatically after an inspection is completed.
 *
 * Returns `null` when no automatic transition is appropriate (e.g. unknown value).
 */
export function conditionAfterToInstanceStatus(
  condition: string,
): string | null {
  switch (condition) {
    case "excellent":
    case "good":
    case "fair":
      return "available";
    case "poor":
      return "maintenance";
    case "damaged":
      return "damaged";
    case "lost":
      return "retired";
    default:
      return null;
  }
}

/**
 * Maps an incident type to the target MaterialInstance status that should be
 * applied when the incident is **created** (i.e. the problem is being reported).
 *
 * Returns `null` for incident types that carry no implicit instance-level impact.
 */
export function incidentTypeOnCreateToInstanceStatus(
  type: IncidentType,
): string | null {
  switch (type) {
    case "damage":
      return "damaged";
    case "lost":
      return "retired";
    case "issue":
      return "maintenance";
    case "replacement":
      return "retired";
    default:
      return null;
  }
}

/**
 * Maps an incident type to the target MaterialInstance status that should be
 * applied when the incident is **resolved** (i.e. the problem is confirmed fixed).
 *
 * Returns `null` when resolution implies no automatic instance change
 * (manual correction is expected instead).
 */
export function incidentTypeOnResolveToInstanceStatus(
  type: IncidentType,
): string | null {
  switch (type) {
    case "damage":
      return "maintenance";
    case "issue":
      return "available";
    default:
      return null;
  }
}
