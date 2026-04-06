import { AppError } from "../../errors/AppError.ts";

/* ---------- Transition Maps ---------- */

/** Allowed status transitions for loan requests. */
export const LOAN_REQUEST_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ["approved", "rejected", "cancelled"],
  approved: ["assigned", "cancelled", "expired", "deposit_pending"],
  deposit_pending: ["assigned", "expired", "cancelled"],
  assigned: ["ready", "cancelled", "expired"],
  ready: ["shipped", "cancelled", "expired"],
  shipped: ["completed"],
  completed: [],
  expired: [],
  rejected: [],
  cancelled: [],
};

/** Allowed status transitions for loans. */
export const LOAN_TRANSITIONS: Record<string, readonly string[]> = {
  active: ["returned", "overdue"],
  overdue: ["returned", "active"],
  returned: ["inspected", "closed"],
  inspected: ["closed"],
  closed: [],
};

/** Allowed status transitions for incidents. */
export const INCIDENT_TRANSITIONS: Record<string, readonly string[]> = {
  open: ["acknowledged", "resolved", "dismissed"],
  acknowledged: ["resolved", "dismissed"],
  resolved: [],
  dismissed: [],
};

/** Allowed status transitions for material instances. */
export const MATERIAL_TRANSITIONS: Record<string, readonly string[]> = {
  available: ["reserved", "maintenance", "damaged", "lost", "retired"],
  reserved: ["available", "loaned"],
  loaned: ["returned"],
  returned: ["available", "maintenance", "damaged", "lost"],
  maintenance: ["available", "retired", "damaged", "lost"],
  damaged: ["maintenance", "retired", "lost"],
  lost: ["retired"],
  retired: [],
};

/** Allowed status transitions for inspections. */
export const INSPECTION_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ["in_progress", "completed"],
  in_progress: ["completed"],
  completed: [],
};

/* ---------- Validation ---------- */

/**
 * Validates that transitioning from `current` to `next` is allowed by `map`.
 * Throws `AppError.conflict` on invalid transitions.
 */
export function validateTransition(
  current: string,
  next: string,
  map: Record<string, readonly string[]>,
): void {
  const allowed = map[current];
  if (!allowed) {
    throw AppError.conflict(
      `Unknown status "${current}" — cannot determine valid transitions`,
    );
  }
  if (!allowed.includes(next)) {
    throw AppError.conflict(
      `Invalid status transition from "${current}" to "${next}"`,
    );
  }
}
