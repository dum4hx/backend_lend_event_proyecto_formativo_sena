import { Types, startSession } from "mongoose";
import { Loan, type LoanDocument } from "./models/loan.model.ts";
import { LoanRequest } from "../request/models/request.model.ts";
import { MaterialInstance } from "../material/models/material_instance.model.ts";
import { Organization } from "../organization/models/organization.model.ts";
import { AppError } from "../../errors/AppError.ts";
import { Inspection } from "../inspection/models/inspection.model.ts";
import { logger } from "../../utils/logger.ts";
import { pricingService } from "../pricing/pricing.service.ts";
import {
  validateTransition,
  LOAN_TRANSITIONS,
  LOAN_REQUEST_TRANSITIONS,
} from "../shared/state_machine.ts";
import { codeGenerationService } from "../code_scheme/code_generation.service.ts";

/* ---------- Internal Helpers ---------- */

/**
 * Validates and applies a status transition on a loan document.
 * Does NOT save — caller is responsible for persisting.
 */
function transitionLoanStatus(
  loan: LoanDocument & { status: string },
  nextStatus: string,
): void {
  validateTransition(loan.status, nextStatus, LOAN_TRANSITIONS);
  loan.status = nextStatus as any;
}

/**
 * Computes refund availability fields on a deposit object.
 * Response-only — not persisted.
 */
function enrichDepositWithRefundInfo(deposit: any): any {
  if (!deposit || deposit.amount === 0) return deposit;

  const alreadyApplied: number = (deposit.transactions ?? [])
    .filter((t: any) => t.type === "applied")
    .reduce((sum: number, t: any) => sum + t.amount, 0);

  return {
    ...deposit,
    refundAvailable:
      deposit.status === "refund_pending" ||
      deposit.status === "partially_applied",
    refundableAmount: Math.max(0, deposit.amount - alreadyApplied),
  };
}

export interface CreateLoanFromRequestInput {
  requestId: string;
  organizationId: string | Types.ObjectId;
  userId: string | Types.ObjectId;
}

export const loanService = {
  /**
   * Creates a loan from a ready request (pickup action by Warehouse Operator).
   * Requires that the deposit has been paid when depositAmount > 0.
   */
  async createLoanFromRequest({
    requestId,
    organizationId,
    userId,
  }: CreateLoanFromRequestInput): Promise<LoanDocument> {
    const session = await startSession();
    let result: LoanDocument | undefined;

    try {
      await session.withTransaction(async () => {
        // Find and validate request
        const request = await LoanRequest.findOne({
          _id: requestId,
          organizationId,
          status: "ready",
        }).session(session);

        if (!request) {
          throw AppError.notFound("Solicitud no encontrada o no está lista para retiro");
        }

        // Enforce payment precondition: deposit must be paid when amount > 0
        const depositAmount = request.depositAmount ?? 0;
        if (depositAmount > 0 && !request.depositPaidAt) {
          throw AppError.badRequest(
            "No se puede crear el préstamo: el depósito de esta solicitud no ha sido pagado aún",
          );
        }

        // Enforce full-payment policy when enabled by the organization
        const org = await Organization.findById(organizationId)
          .select("settings")
          .session(session);
        if (
          org?.settings?.requireFullPaymentBeforeCheckout &&
          (request.totalAmount ?? 0) > 0 &&
          !request.rentalFeePaidAt
        ) {
          throw AppError.badRequest(
            "No se puede crear el préstamo: la tarifa de alquiler no ha sido pagada y la organización requiere pago completo antes del retiro",
          );
        }

        // Update material instances to loaned status
        const instanceIds = await (request as any).markAssignedMaterialsLoaned(
          session,
        );

        // Build deposit object from request.depositAmount
        const rawDepositAmount = request.depositAmount ?? 0;
        const deposit =
          rawDepositAmount > 0
            ? {
                amount: rawDepositAmount,
                status: "held" as const,
                transactions: [
                  {
                    type: "held" as const,
                    amount: rawDepositAmount,
                    date: new Date(),
                    reference: "Deposit held at checkout",
                  },
                ],
              }
            : { amount: 0, status: "not_required" as const, transactions: [] };

        // Build material instance details (also capture locationId from the first instance)
        let loanLocationId: Types.ObjectId | undefined;
        const materialInstancesPayload = await Promise.all(
          instanceIds.map(async (id: any) => {
            const instance = await MaterialInstance.findById(id)
              .select("modelId locationId")
              .session(session);
            if (!loanLocationId && instance?.locationId) {
              loanLocationId = instance.locationId as Types.ObjectId;
            }
            return {
              materialInstanceId: id,
              materialTypeId: instance?.modelId ?? id,
              conditionAtCheckout: "good",
            };
          }),
        );

        if (!loanLocationId) {
          throw AppError.badRequest(
            "No se puede determinar la ubicación de origen del préstamo: no se encontraron instancias de material válidas",
          );
        }

        // Generate unique code for this loan
        const code = await codeGenerationService.generateCode({
          organizationId,
          entityType: "loan",
          context: { locationId: loanLocationId },
          session,
        });

        // Create the loan
        const [loan]: any = await (Loan as any).create(
          [
            {
              organizationId,
              customerId: request.customerId,
              requestId: request._id,
              locationId: loanLocationId,
              materialInstances: materialInstancesPayload,
              startDate: new Date(),
              endDate: request.endDate,
              deposit,
              totalAmount: request.totalAmount ?? 0,
              pricingSnapshot: pricingService.buildLoanPricingSnapshot(request),
              checkedOutBy: new Types.ObjectId(userId),
              status: "active",
              code,
            },
          ],
          { session },
        );

        // Mark the request as shipped (materials dispatched) and link the loan
        validateTransition(request.status, "shipped", LOAN_REQUEST_TRANSITIONS);
        request.status = "shipped";
        (request as any).loanId = loan._id;
        await request.save({ session });

        const populatedLoan = await Loan.findById(loan._id)
          .session(session)
          .populate("customerId", "email name")
          .populate(
            "materialInstances.materialInstanceId",
            "serialNumber modelId",
          );

        logger.info("Loan created from request", {
          loanId: loan._id.toString(),
          requestId,
          organizationId: organizationId.toString(),
          checkedOutBy: userId.toString(),
        });

        result = populatedLoan as unknown as LoanDocument;
      });

      return result as LoanDocument;
    } finally {
      await session.endSession();
    }
  },

  /**
   * Returns a loan and updates material status to 'returned'.
   */
  async returnLoan(
    loanId: string | Types.ObjectId,
    organizationId: string | Types.ObjectId,
    notes?: string,
  ): Promise<LoanDocument> {
    const session = await startSession();
    let result;

    try {
      await session.withTransaction(async () => {
        const loan = await Loan.findOne({
          _id: loanId,
          organizationId,
          status: { $in: ["active", "overdue"] },
        }).session(session);

        if (!loan) {
          throw AppError.notFound("Préstamo no encontrado o ya devuelto");
        }

        transitionLoanStatus(loan, "returned");

        // Update material instances to returned status (pending inspection)
        const instanceIds = loan.materialInstances.map(
          (mi) => mi.materialInstanceId,
        );
        await MaterialInstance.updateMany(
          { _id: { $in: instanceIds } },
          { $set: { status: "returned" } },
          { session },
        );
        loan.returnedAt = new Date();
        if (notes) {
          loan.notes = (loan.notes ?? "") + `\nReturn notes: ${notes}`;
        }

        // Transition deposit from held to refund_pending now that materials are back
        const loanDeposit = (loan as any).deposit;
        if (loanDeposit?.amount > 0 && loanDeposit.status === "held") {
          loanDeposit.status = "refund_pending";
        }

        await loan.save({ session });

        result = loan;
      });

      return result as unknown as LoanDocument;
    } finally {
      await session.endSession();
    }
  },

  /**
   * Completes a loan after inspection.
   */
  async completeLoan(
    loanId: string | Types.ObjectId,
    organizationId: string | Types.ObjectId,
  ): Promise<LoanDocument> {
    const loan = await Loan.findOne({
      _id: loanId,
      organizationId,
      status: "returned",
    });

    if (!loan) {
      throw AppError.notFound("Préstamo no encontrado o no está en estado devuelto");
    }

    transitionLoanStatus(loan, "closed");

    // Guard: deposit must be fully resolved before closing
    const deposit = (loan as any).deposit;
    if (deposit && deposit.amount > 0) {
      const resolved =
        deposit.status === "applied" || deposit.status === "refunded";
      if (!resolved) {
        throw AppError.badRequest(
          `No se puede cerrar el préstamo: el depósito no está completamente resuelto. Estado actual del depósito: "${deposit.status}". ` +
            `Resuelva el depósito (aplicar o reembolsar) antes de cerrar el préstamo.`,
        );
      }
    }

    // Check if inspection exists and is completed
    const { Inspection } =
      await import("../inspection/models/inspection.model.ts");
    const inspection = await Inspection.findOne({
      loanId: loan._id,
    });

    if (!inspection) {
      throw AppError.badRequest("El préstamo debe ser inspeccionado antes de completarse");
    }

    // Update materials to available (or damaged based on inspection)
    for (const instance of loan.materialInstances) {
      const inspectionItem = inspection.items.find(
        (item) =>
          item.materialInstanceId.toString() ===
          instance.materialInstanceId.toString(),
      );

      const newStatus =
        inspectionItem?.conditionAfter === "damaged"
          ? "damaged"
          : inspectionItem?.conditionAfter === "lost"
            ? "lost"
            : "available";

      await MaterialInstance.updateOne(
        { _id: instance.materialInstanceId },
        { $set: { status: newStatus } },
      );
    }

    await loan.save();

    return loan as unknown as LoanDocument;
  },

  /**
   * Extends a loan's end date.
   */
  async extendLoan(
    loanId: string | Types.ObjectId,
    organizationId: string | Types.ObjectId,
    newEndDate: Date,
    notes?: string,
  ): Promise<LoanDocument> {
    const loan = await Loan.findOne({
      _id: loanId,
      organizationId,
      status: { $in: ["active", "overdue"] },
    });

    if (!loan) {
      throw AppError.notFound("Préstamo no encontrado o no se puede extender");
    }

    if (newEndDate <= loan.endDate) {
      throw AppError.badRequest("La nueva fecha de fin debe ser posterior a la fecha de fin actual");
    }

    loan.endDate = newEndDate;
    if (loan.status === "overdue") {
      transitionLoanStatus(loan, "active");
    }
    if (notes) {
      loan.notes = (loan.notes ?? "") + `\nExtension: ${notes}`;
    }
    await loan.save();

    return loan as unknown as LoanDocument;
  },

  /**
   * Lists all loans in the organization.
   */
  async listLoans(
    organizationId: string | Types.ObjectId,
    query: {
      page?: number;
      limit?: number;
      status?: string;
      customerId?: string;
      overdue?: boolean;
      sortBy?: string;
      sortOrder?: "asc" | "desc";
    } = {},
  ): Promise<{
    loans: LoanDocument[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      limit = 20,
      status,
      customerId,
      overdue,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = query;

    const skip = (page - 1) * limit;
    const filter: Record<string, any> = { organizationId };

    if (status) filter.status = status;
    if (customerId) filter.customerId = customerId;
    if (overdue === true) {
      filter.status = "overdue";
    }

    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const [loans, total] = await Promise.all([
      Loan.find(filter)
        .skip(skip)
        .limit(limit)
        .populate("customerId", "email name")
        .sort({ [sortBy]: sortDirection }),
      Loan.countDocuments(filter),
    ]);

    return {
      loans: loans.map((l) => {
        const obj = l.toObject() as any;
        obj.deposit = enrichDepositWithRefundInfo(obj.deposit);
        return obj;
      }) as unknown as LoanDocument[],
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Refunds the deposit for a loan whose deposit is in refund_pending or partially_applied status.
   * Records the refund transaction and marks deposit as refunded.
   */
  async refundDeposit(params: {
    loanId: string | Types.ObjectId;
    organizationId: string | Types.ObjectId;
    notes?: string;
  }): Promise<LoanDocument> {
    const { loanId, organizationId, notes } = params;

    const loan = await Loan.findOne({
      _id: loanId,
      organizationId,
    });

    if (!loan) {
      throw AppError.notFound("Préstamo no encontrado");
    }

    const deposit = (loan as any).deposit;
    if (!deposit || deposit.amount === 0) {
      throw AppError.badRequest("Este préstamo no tiene depósito para reembolsar");
    }

    // Ensure the loan has a completed inspection before allowing a refund
    const completedInspection = await Inspection.exists({
      loanId: loan._id,
      organizationId,
      status: "completed",
    });
    if (!completedInspection) {
      throw AppError.badRequest(
        "No se puede reembolsar el depósito hasta que el préstamo tenga una inspección completada.",
      );
    }

    if (
      deposit.status !== "refund_pending" &&
      deposit.status !== "partially_applied"
    ) {
      throw AppError.badRequest(
        `El depósito no puede ser reembolsado en su estado actual: "${deposit.status}". ` +
          `Solo los depósitos en estado "refund_pending" o "partially_applied" pueden ser reembolsados.`,
      );
    }

    // Calculate how much was already applied
    const alreadyApplied: number = (deposit.transactions as any[])
      .filter((t: any) => t.type === "applied")
      .reduce((sum: number, t: any) => sum + t.amount, 0);

    const refundAmount = deposit.amount - alreadyApplied;

    deposit.transactions.push({
      type: "refund",
      amount: refundAmount,
      date: new Date(),
      reference: notes ?? "Deposit refunded",
    });
    deposit.status = "refunded";

    await loan.save();

    return loan as unknown as LoanDocument;
  },

  /**
   * Gets a specific loan by ID. Includes computed deposit refund availability.
   * Optionally groups materialInstances by materialTypeId using MongoDB aggregation.
   *
   * @param groupByMaterialType If true, groups materialInstances by materialTypeId at the database level
   *                            and returns materialInstancesByType object instead of array.
   */
  async getLoanById(
    loanId: string | Types.ObjectId,
    organizationId: string | Types.ObjectId,
    opts?: { groupByMaterialType?: boolean },
  ): Promise<LoanDocument> {
    const loanIdObj = new Types.ObjectId(loanId);
    const orgIdObj = new Types.ObjectId(organizationId);

    const pipeline: any[] = [
      { $match: { _id: loanIdObj, organizationId: orgIdObj } },
      // Populate customer — write result back into customerId field directly
      {
        $lookup: {
          from: "customers",
          localField: "customerId",
          foreignField: "_id",
          as: "customerId",
          pipeline: [{ $project: { email: 1, name: 1, phone: 1, address: 1 } }],
        },
      },
      { $unwind: { path: "$customerId", preserveNullAndEmptyArrays: true } },
      // Populate request — write result back into requestId field directly
      {
        $lookup: {
          from: "loanrequests",
          localField: "requestId",
          foreignField: "_id",
          as: "requestId",
          pipeline: [{ $project: { startDate: 1, endDate: 1 } }],
        },
      },
      { $unwind: { path: "$requestId", preserveNullAndEmptyArrays: true } },
      // Unwind materialInstances for per-instance lookups
      { $unwind: "$materialInstances" },
      // Populate materialInstance details — write result back into materialInstances.materialInstanceId
      {
        $lookup: {
          from: "materialinstances",
          localField: "materialInstances.materialInstanceId",
          foreignField: "_id",
          as: "materialInstances.materialInstanceId",
          pipeline: [
            { $project: { serialNumber: 1, status: 1, modelId: 1, name: 1 } },
          ],
        },
      },
      {
        $unwind: {
          path: "$materialInstances.materialInstanceId",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Populate materialType details
      {
        $lookup: {
          from: "materialtypes",
          localField: "materialInstances.materialTypeId",
          foreignField: "_id",
          as: "materialInstances.materialType",
          pipeline: [{ $project: { _id: 1, name: 1 } }],
        },
      },
      {
        $unwind: {
          path: "$materialInstances.materialType",
          preserveNullAndEmptyArrays: true,
        },
      },
    ];

    const instanceShape = {
      materialInstanceId: "$materialInstances.materialInstanceId",
      materialTypeId: "$materialInstances.materialTypeId",
      materialType: "$materialInstances.materialType",
    };

    if (opts?.groupByMaterialType) {
      pipeline.push(
        // Stage 1: group by loan + materialType to collect each type's instances
        {
          $group: {
            _id: {
              loanId: "$_id",
              typeId: "$materialInstances.materialTypeId",
            },
            root: { $first: "$$ROOT" },
            typeName: { $first: "$materialInstances.materialType.name" },
            instances: { $push: instanceShape },
          },
        },
        // Stage 2: group by loan, build the final keyed map keyed by materialType name
        {
          $group: {
            _id: "$_id.loanId",
            root: { $first: "$root" },
            typeGroups: {
              $push: {
                k: { $ifNull: ["$typeName", { $toString: "$_id.typeId" }] },
                v: {
                  materialType: { $first: "$instances.materialType" },
                  instances: "$instances",
                },
              },
            },
          },
        },
        {
          $replaceRoot: {
            newRoot: {
              $mergeObjects: [
                "$root",
                { materialInstancesByType: { $arrayToObject: "$typeGroups" } },
              ],
            },
          },
        },
        // Remove the residual single-item materialInstances leaked from $$ROOT
        { $unset: "materialInstances" },
      );
    } else {
      pipeline.push(
        {
          $group: {
            _id: "$_id",
            root: { $first: "$$ROOT" },
            materialInstances: { $push: instanceShape },
          },
        },
        {
          $replaceRoot: {
            newRoot: {
              $mergeObjects: [
                "$root",
                { materialInstances: "$materialInstances" },
              ],
            },
          },
        },
      );
    }

    const [loan] = await Loan.aggregate(pipeline);

    if (!loan) {
      throw AppError.notFound("Préstamo no encontrado");
    }

    const loanObj = loan as any;
    loanObj.deposit = enrichDepositWithRefundInfo(loanObj.deposit);

    return loanObj as LoanDocument;
  },
};
