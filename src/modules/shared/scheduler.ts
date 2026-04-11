import { Types, startSession } from "mongoose";
import { Loan } from "../loan/models/loan.model.ts";
import { LoanRequest } from "../request/models/request.model.ts";
import { MaterialInstance } from "../material/models/material_instance.model.ts";
import { User } from "../user/models/user.model.ts";
import { Organization } from "../organization/models/organization.model.ts";
import { organizationService } from "../organization/organization.service.ts";
import { applyLateFee } from "../loan/loan.service.ts";
import { logger } from "../../utils/logger.ts";
import { emailService } from "../../utils/email.ts";
import {
  validateTransition,
  LOAN_TRANSITIONS,
  LOAN_REQUEST_TRANSITIONS,
} from "./state_machine.ts";
import { incidentService } from "../incident/incident.service.ts";

/* ---------- Scheduled Job Intervals ---------- */

const OVERDUE_DETECTION_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const REQUEST_EXPIRATION_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const REFUND_REMINDER_INTERVAL_MS = 4 * 60 * 60 * 1000; // every 4 hours
const SUBSCRIPTION_EXPIRATION_INTERVAL_MS = 30 * 60 * 1000; // every 30 minutes
const SUBSCRIPTION_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 hours

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

      // Transition to overdue + apply late fee atomically
      const loanSession = await startSession();
      try {
        await loanSession.withTransaction(async () => {
          const freshLoan = await Loan.findById(loan._id).session(loanSession);
          if (!freshLoan || freshLoan.status !== "active") return;

          freshLoan.status = "overdue";

          await applyLateFee({
            loan: freshLoan,
            organizationId: freshLoan.organizationId,
            triggeredBy: freshLoan.checkedOutBy as Types.ObjectId,
            session: loanSession,
          });

          await freshLoan.save({ session: loanSession });
        });
      } catch (txnErr) {
        logger.error("Failed to transition loan to overdue with late fee", {
          loanId: loan._id.toString(),
          error: txnErr,
        });
        continue; // skip incident/email on failure
      } finally {
        await loanSession.endSession();
      }

      // Create overdue incident (idempotent — skips if one already exists)
      try {
        const daysOverdue = Math.ceil(
          (now.getTime() - new Date(loan.endDate).getTime()) /
            (1000 * 60 * 60 * 24),
        );
        await incidentService.createIncident({
          organizationId: loan.organizationId as any,
          loanId: loan._id as any,
          context: "loan",
          type: "overdue",
          createdBy: loan.checkedOutBy as any,
          sourceType: "scheduler",
          severity: daysOverdue > 7 ? "high" : "medium",
          metadata: { daysOverdue },
        });
      } catch (incidentErr) {
        logger.error("Failed to create overdue incident", {
          loanId: loan._id.toString(),
          error: incidentErr,
        });
      }

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

/* ---------- Subscription Expiration Detection ---------- */

/**
 * Suspends organizations with expired paid subscriptions that haven't been
 * updated by Stripe webhooks within the grace period.
 *
 * This is a safety net — Stripe webhooks handle the real-time case, and
 * this job catches any missed events.
 */
async function detectExpiredSubscriptions(): Promise<void> {
  try {
    const gracePeriodCutoff = new Date(
      Date.now() - SUBSCRIPTION_GRACE_PERIOD_MS,
    );

    // Find active orgs with paid plans whose billing period ended before the grace cutoff
    const expiredOrgs = await Organization.find({
      status: "active",
      "subscription.plan": { $ne: "free" },
      "subscription.currentPeriodEnd": { $lt: gracePeriodCutoff },
    }).select("_id subscription.plan subscription.currentPeriodEnd");

    if (expiredOrgs.length === 0) return;

    for (const org of expiredOrgs) {
      try {
        await organizationService.suspend(org._id);
        logger.info("Organization suspended due to expired subscription", {
          organizationId: org._id.toString(),
          plan: org.subscription?.plan,
          currentPeriodEnd: org.subscription?.currentPeriodEnd,
        });
      } catch (err) {
        logger.error("Failed to suspend expired organization", {
          organizationId: org._id.toString(),
          error: err,
        });
      }
    }

    logger.info("Subscription expiration detection completed", {
      suspendedCount: expiredOrgs.length,
    });
  } catch (err) {
    logger.error("Failed to detect expired subscriptions", { error: err });
  }
}

/* ---------- Scheduler Startup ---------- */

let overdueInterval: ReturnType<typeof setInterval> | null = null;
let expirationInterval: ReturnType<typeof setInterval> | null = null;
let refundReminderInterval: ReturnType<typeof setInterval> | null = null;
let subscriptionExpirationInterval: ReturnType<typeof setInterval> | null =
  null;

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

  void detectExpiredSubscriptions();
  subscriptionExpirationInterval = setInterval(
    detectExpiredSubscriptions,
    SUBSCRIPTION_EXPIRATION_INTERVAL_MS,
  );

  logger.info("Scheduled background jobs started", {
    overdueDetectionIntervalMs: OVERDUE_DETECTION_INTERVAL_MS,
    requestExpirationIntervalMs: REQUEST_EXPIRATION_INTERVAL_MS,
    refundReminderIntervalMs: REFUND_REMINDER_INTERVAL_MS,
    subscriptionExpirationIntervalMs: SUBSCRIPTION_EXPIRATION_INTERVAL_MS,
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
  if (subscriptionExpirationInterval) {
    clearInterval(subscriptionExpirationInterval);
    subscriptionExpirationInterval = null;
  }
}
