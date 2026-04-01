/* ---------- Default Condition Levels ---------- */

/**
 * Ordered condition levels used across the loan lifecycle.
 * Index determines severity — higher index = worse condition.
 * Future: tenant-specific conditions via org-scoped CRUD replace these defaults.
 */
export const DEFAULT_CONDITION_LEVELS = [
  { name: "excellent", index: 0 },
  { name: "good", index: 1 },
  { name: "fair", index: 2 },
  { name: "poor", index: 3 },
  { name: "damaged", index: 4 },
  { name: "lost", index: 5 },
] as const;

/** Condition names allowed at checkout (excludes damaged/lost). */
export const conditionAtCheckoutOptions = DEFAULT_CONDITION_LEVELS.filter(
  (c) => c.index <= 3,
).map((c) => c.name);

/** Condition names allowed at return (all levels). */
export const conditionAtReturnOptions = DEFAULT_CONDITION_LEVELS.map(
  (c) => c.name,
);

/**
 * Returns the severity index for a condition name.
 * Defaults to -1 when not found.
 */
export function getConditionIndex(name: string): number {
  const level = DEFAULT_CONDITION_LEVELS.find((c) => c.name === name);
  return level ? level.index : -1;
}

/**
 * Returns `true` when the "after" condition is worse than the "before" condition.
 */
export function isConditionDegraded(before: string, after: string): boolean {
  const beforeIdx = getConditionIndex(before);
  const afterIdx = getConditionIndex(after);
  if (beforeIdx === -1 || afterIdx === -1) return false;
  return afterIdx > beforeIdx;
}
