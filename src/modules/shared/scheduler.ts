import { Loan } from "../loan/models/loan.model.ts";
import { LoanRequest } from "../request/models/request.model.ts";
import { MaterialInstance } from "../material/models/material_instance.model.ts";
import { User } from "../user/models/user.model.ts";
import { logger } from "../../utils/logger.ts";
import { emailService } from "../../utils/email.ts";
import {
  validateTransition,
  LOAN_TRANSITIONS,
  LOAN_REQUEST_TRANSITIONS,
} from "./state_machine.ts";

/* ---------- Scheduled Job Intervals ---------- */

const OVERDUE_DETECTION_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const REQUEST_EXPIRATION_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const REFUND_REMINDER_INTERVAL_MS = 4 * 60 * 60 * 1000; // every 4 hours

/* ---------- Overdue Loan Detection ---------- */

/**
 * Transitions all `active` loans past their `endDate` to `overdue` and
 * sends email notifications to the user who created the associated request.
 */
async function detectOverdueLoans(): Promise<void> {
  try {
    const now = new Date();

    const overdueLoans = await Loan.find({
      status: "active",
      endDate: { $lt: now },
    });

    if (overdueLoans.length === 0) return;

    for (const loan of overdueLoans) {
      try {
        validateTransition(loan.status, "overdue", LOAN_TRANSITIONS);
      } catch {
        continue; // skip loans whose status doesn't allow this transition
      }
      loan.status = "overdue";
      await loan.save();

      // Send notification to the request creator
      try {
        const request = await LoanRequest.findById(loan.requestId)
          .populate("customerId", "name")
          .populate("createdBy", "email firstName status")
          .lean();

        const creator = request?.createdBy as any;
        if (creator?.status === "active" && creator?.email) {
          const daysOverdue = Math.ceil(
            (now.getTime() - new Date(loan.endDate).getTime()) /
              (1000 * 60 * 60 * 24),
          );
          await emailService.sendOverdueLoanNotification(
            creator.email,
            creator.firstName ?? "User",
            {
              loanId: loan._id.toString(),
              customerName: (request?.customerId as any)?.name ?? "Unknown",
              endDate: loan.endDate,
              daysOverdue,
            },
          );
        }
      } catch (emailErr) {
        logger.error("Failed to send overdue notification email", {
          loanId: loan._id.toString(),
          error: emailErr,
        });
      }
    }

    logger.info("Overdue loan detection completed", {
      modifiedCount: overdueLoans.length,
    });
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

      try {
        validateTransition(request.status, "expired", LOAN_REQUEST_TRANSITIONS);
      } catch {
        continue; // skip requests whose status doesn't allow this transition
      }
      request.status = "expired";
      await request.save();

      // Send notification to the request creator
      try {
        const populatedRequest = await LoanRequest.findById(request._id)
          .populate("customerId", "name")
          .populate("createdBy", "email firstName status")
          .lean();

        const creator = populatedRequest?.createdBy as any;
        if (creator?.status === "active" && creator?.email) {
          await emailService.sendRequestExpiredNotification(
            creator.email,
            creator.firstName ?? "User",
            {
              requestId: request._id.toString(),
              customerName:
                (populatedRequest?.customerId as any)?.name ?? "Unknown",
              depositDueDate: request.depositDueDate!,
            },
          );
        }
      } catch (emailErr) {
        logger.error("Failed to send request expired notification email", {
          requestId: request._id.toString(),
          error: emailErr,
        });
      }

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

/* ---------- Deposit Refund Reminders ---------- */

/**
 * Sends reminder emails for loans with pending deposit refunds that have been
 * waiting more than 48 hours. Reminders are throttled to at most one per 48h
 * per loan via `lastRefundReminderSentAt`.
 */
async function sendRefundReminders(): Promise<void> {
  try {
    const now = new Date();
    const threshold48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const loans = await Loan.find({
      "deposit.status": "refund_pending",
      returnedAt: { $lt: threshold48h },
      $or: [
        { lastRefundReminderSentAt: { $exists: false } },
        { lastRefundReminderSentAt: null },
        { lastRefundReminderSentAt: { $lt: threshold48h } },
      ],
    });

    if (loans.length === 0) return;

    for (const loan of loans) {
      try {
        const user = await User.findById(loan.checkedOutBy)
          .select("email firstName status")
          .lean();

        if (user?.status === "active" && user?.email) {
          const daysPending = Math.ceil(
            (now.getTime() - new Date(loan.returnedAt!).getTime()) /
              (1000 * 60 * 60 * 24),
          );

          await emailService.sendDepositRefundReminder(
            user.email,
            (user as any).firstName ?? "User",
            {
              loanId: loan._id.toString(),
              customerName: "Customer", // populated separately if needed
              depositAmount: loan.deposit?.amount ?? 0,
              daysPending,
            },
          );
        }

        loan.lastRefundReminderSentAt = now;
        await loan.save();
      } catch (emailErr) {
        logger.error("Failed to send refund reminder email", {
          loanId: loan._id.toString(),
          error: emailErr,
        });
      }
    }

    logger.info("Refund reminder job completed", {
      remindersProcessed: loans.length,
    });
  } catch (err) {
    logger.error("Failed to send refund reminders", { error: err });
  }
}

/* ---------- Scheduler Startup ---------- */

let overdueInterval: ReturnType<typeof setInterval> | null = null;
let expirationInterval: ReturnType<typeof setInterval> | null = null;
let refundReminderInterval: ReturnType<typeof setInterval> | null = null;

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

  void sendRefundReminders();
  refundReminderInterval = setInterval(
    sendRefundReminders,
    REFUND_REMINDER_INTERVAL_MS,
  );

  logger.info("Scheduled background jobs started", {
    overdueDetectionIntervalMs: OVERDUE_DETECTION_INTERVAL_MS,
    requestExpirationIntervalMs: REQUEST_EXPIRATION_INTERVAL_MS,
    refundReminderIntervalMs: REFUND_REMINDER_INTERVAL_MS,
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
  if (refundReminderInterval) {
    clearInterval(refundReminderInterval);
    refundReminderInterval = null;
  }
}
