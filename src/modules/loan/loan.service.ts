import { Types, startSession } from "mongoose";
import { Loan, type LoanDocument } from "./models/loan.model.ts";
import { LoanRequest } from "../request/models/request.model.ts";
import { MaterialInstance } from "../material/models/material_instance.model.ts";
import { AppError } from "../../errors/AppError.ts";
import { logger } from "../../utils/logger.ts";
import { pricingService } from "../pricing/pricing.service.ts";

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
          throw AppError.notFound("Request not found or not ready for pickup");
        }

        // Enforce payment precondition: deposit must be paid when amount > 0
        const depositAmount = request.depositAmount ?? 0;
        if (depositAmount > 0 && !request.depositPaidAt) {
          throw AppError.badRequest(
            "Cannot create a loan: the deposit for this request has not been paid yet",
          );
        }

        // Update material instances to loaned status
        const instanceIds = await (request as any).markAssignedMaterialsLoaned(
          session,
        );

        // Create the loan
        const [loan]: any = await (Loan as any).create(
          [
            {
              organizationId,
              customerId: request.customerId,
              requestId: request._id,
              materialInstances: instanceIds.map((id: any) => ({
                materialInstanceId: id,
                materialTypeId: id,
              })),
              startDate: new Date(),
              endDate: request.endDate,
              depositAmount,
              totalAmount: request.totalAmount ?? 0,
              pricingSnapshot: pricingService.buildLoanPricingSnapshot(request),
              checkedOutBy: new Types.ObjectId(userId),
              status: "active",
            },
          ],
          { session },
        );

        // Mark the request as shipped (materials dispatched) and link the loan
        await LoanRequest.updateOne(
          { _id: request._id },
          { $set: { status: "shipped", loanId: loan._id } },
          { session },
        );

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
          throw AppError.notFound("Loan not found or already returned");
        }

        // Update material instances to returned status (pending inspection)
        const instanceIds = loan.materialInstances.map(
          (mi) => mi.materialInstanceId,
        );
        await MaterialInstance.updateMany(
          { _id: { $in: instanceIds } },
          { $set: { status: "returned" } },
          { session },
        );

        loan.status = "returned";
        loan.returnedAt = new Date();
        if (notes) {
          loan.notes = (loan.notes ?? "") + `\nReturn notes: ${notes}`;
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
      throw AppError.notFound("Loan not found or not in returned status");
    }

    // Check if inspection exists and is completed
    const { Inspection } =
      await import("../inspection/models/inspection.model.ts");
    const inspection = await Inspection.findOne({
      loanId: loan._id,
    });

    if (!inspection) {
      throw AppError.badRequest("Loan must be inspected before completion");
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

    loan.status = "closed";
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
      throw AppError.notFound("Loan not found or cannot be extended");
    }

    if (newEndDate <= loan.endDate) {
      throw AppError.badRequest("New end date must be after current end date");
    }

    loan.endDate = newEndDate;
    loan.status = "active"; // Reset from overdue if applicable
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
      loans: loans as unknown as LoanDocument[],
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Gets a specific loan by ID.
   */
  async getLoanById(
    loanId: string | Types.ObjectId,
    organizationId: string | Types.ObjectId,
  ): Promise<LoanDocument> {
    const loan = await Loan.findOne({
      _id: loanId,
      organizationId,
    })
      .populate("customerId", "email name phone address")
      .populate(
        "materialInstances.materialInstanceId",
        "serialNumber status modelId",
      )
      .populate("requestId", "startDate endDate");

    if (!loan) {
      throw AppError.notFound("Loan not found");
    }

    return loan as unknown as LoanDocument;
  },
};
