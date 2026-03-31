import { Loan } from "../loan/models/loan.model.ts";
import { LoanRequest } from "../request/models/request.model.ts";
import { MaterialInstance } from "../material/models/material_instance.model.ts";
import { logger } from "../../utils/logger.ts";

/* ---------- Scheduled Job Intervals ---------- */

const OVERDUE_DETECTION_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const REQUEST_EXPIRATION_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

/* ---------- Overdue Loan Detection ---------- */

/**
 * Transitions all `active` loans past their `endDate` to `overdue`.
 * Runs periodically so the frontend/reports always reflect accurate status.
 *
 * This is idempotent — calling it multiple times has no harmful side effects.
 */
async function detectOverdueLoans(): Promise<void> {
  try {
    const now = new Date();

    const result = await Loan.updateMany(
      {
        status: "active",
        endDate: { $lt: now },
      },
      { $set: { status: "overdue" } },
    );

    if (result.modifiedCount > 0) {
      logger.info("Overdue loan detection completed", {
        modifiedCount: result.modifiedCount,
      });
    }
  } catch (err) {
    logger.error("Failed to detect overdue loans", { error: err });
  }
}

/* ---------- Request Expiration ---------- */

/**
 * Expires approved/deposit_pending requests whose `depositDueDate` has
 * passed without a deposit payment, and releases any reserved materials.
 *
 * The TTL index on `expiresAt` only handles `deposit_pending` requests.
 * This job additionally catches `approved` requests that should have
 * transitioned to `deposit_pending` but never did, and any request whose
 * `depositDueDate` has passed regardless of sub-status.
 */
async function expireStaleRequests(): Promise<void> {
  try {
    const now = new Date();

    // Find requests that are past their deposit deadline and still open
    const staleRequests = await LoanRequest.find({
      status: { $in: ["approved", "deposit_pending", "assigned", "ready"] },
      depositDueDate: { $lt: now },
      depositPaidAt: { $exists: false },
    });

    if (staleRequests.length === 0) return;

    for (const request of staleRequests) {
      // Release any assigned materials
      if (request.assignedMaterials && request.assignedMaterials.length > 0) {
        const instanceIds = request.assignedMaterials.map(
          (am) => am.materialInstanceId,
        );
        await MaterialInstance.updateMany(
          {
            _id: { $in: instanceIds },
            status: { $in: ["reserved", "loaned"] },
          },
          { $set: { status: "available" } },
        );
      }

      request.status = "expired";
      await request.save();

      logger.info("Request expired due to deposit deadline", {
        requestId: request._id.toString(),
        organizationId: (request.organizationId as any).toString(),
        depositDueDate: request.depositDueDate,
      });
    }

    logger.info("Stale request expiration completed", {
      expiredCount: staleRequests.length,
    });
  } catch (err) {
    logger.error("Failed to expire stale requests", { error: err });
  }
}

/* ---------- Scheduler Startup ---------- */

let overdueInterval: ReturnType<typeof setInterval> | null = null;
let expirationInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Starts all scheduled background jobs.
 * Safe to call multiple times — guards against duplicate intervals.
 */
export function startScheduledJobs(): void {
  if (overdueInterval) return; // already started

  // Run once immediately, then on interval
  void detectOverdueLoans();
  overdueInterval = setInterval(
    detectOverdueLoans,
    OVERDUE_DETECTION_INTERVAL_MS,
  );

  void expireStaleRequests();
  expirationInterval = setInterval(
    expireStaleRequests,
    REQUEST_EXPIRATION_INTERVAL_MS,
  );

  logger.info("Scheduled background jobs started", {
    overdueDetectionIntervalMs: OVERDUE_DETECTION_INTERVAL_MS,
    requestExpirationIntervalMs: REQUEST_EXPIRATION_INTERVAL_MS,
  });
}

/**
 * Stops all scheduled background jobs. Useful for graceful shutdown or tests.
 */
export function stopScheduledJobs(): void {
  if (overdueInterval) {
    clearInterval(overdueInterval);
    overdueInterval = null;
  }
  if (expirationInterval) {
    clearInterval(expirationInterval);
    expirationInterval = null;
  }
}
