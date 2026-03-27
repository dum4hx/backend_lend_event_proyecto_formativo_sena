import { Types, startSession } from "mongoose";
import { Inspection } from "./models/inspection.model.ts";
import { Loan } from "../loan/models/loan.model.ts";
import { Invoice } from "../invoice/models/invoice.model.ts";
import { AppError } from "../../errors/AppError.ts";

export const inspectionService = {
  /**
   * Lists all inspections with pagination and optional loan filter.
   */
  async listInspections(params: {
    organizationId: string | Types.ObjectId;
    page: number;
    limit: number;
    loanId?: string;
  }) {
    const { organizationId, page, limit, loanId } = params;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = { organizationId };
    if (loanId) {
      query.loanId = loanId;
    }

    const [inspections, total] = await Promise.all([
      Inspection.find(query)
        .skip(skip)
        .limit(limit)
        .populate("loanId", "customerId startDate endDate")
        .populate("inspectedBy", "email profile.firstName")
        .sort({ createdAt: -1 }),
      Inspection.countDocuments(query),
    ]);

    return {
      inspections,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Gets a specific inspection by ID.
   */
  async getInspectionById(id: string, organizationId: string | Types.ObjectId) {
    const inspection = await Inspection.findOne({
      _id: id,
      organizationId,
    })
      .populate("loanId")
      .populate("inspectedBy", "email profile")
      .populate("items.materialInstanceId", "serialNumber modelId");

    if (!inspection) {
      throw AppError.notFound("Inspection not found");
    }

    return inspection;
  },

  /**
   * Gets loans that are returned but not yet inspected.
   */
  async getPendingLoans(organizationId: string | Types.ObjectId) {
    // Find returned loans without inspections
    const returnedLoans = await Loan.find({
      organizationId,
      status: "returned",
    });

    const existingInspections = await Inspection.find({
      loanId: { $in: returnedLoans.map((l) => l._id) },
    }).select("loanId");

    const inspectedLoanIds = new Set(
      existingInspections.map((i) => i.loanId.toString()),
    );

    const pendingLoans = await Loan.find({
      _id: {
        $in: returnedLoans
          .filter((l) => !inspectedLoanIds.has(l._id.toString()))
          .map((l) => l._id),
      },
    })
      .populate("customerId", "email name")
      .populate("materialInstances.materialInstanceId", "serialNumber modelId");

    return pendingLoans;
  },

  /**
   * Creates an inspection for a returned loan and generates invoice if damages exist.
   */
  async createInspection(params: {
    organizationId: string | Types.ObjectId;
    userId: string | Types.ObjectId;
    loanId: string;
    items: Array<{
      materialInstanceId: string;
      condition: "good" | "damaged" | "lost";
      notes?: string;
      damageDescription?: string;
      damageCost?: number;
    }>;
    overallNotes?: string;
  }) {
    const { organizationId, userId, loanId, items, overallNotes } = params;

    const session = await startSession();
    let result: { inspection: any; totalDamageCost: number } | undefined;

    try {
      await session.withTransaction(async () => {
        // Validate loan exists and is in returned status
        const loan = await Loan.findOne({
          _id: loanId,
          organizationId,
          status: "returned",
        }).session(session);

        if (!loan) {
          throw AppError.notFound("Loan not found or not in returned status");
        }

        // Check if inspection already exists
        const existingInspection = await Inspection.findOne({
          loanId: loan._id,
        }).session(session);
        if (existingInspection) {
          throw AppError.conflict("Inspection already exists for this loan");
        }

        // Validate all items match loan materials
        const loanMaterialIds = loan.materialInstances.map((mi: any) =>
          mi.materialInstanceId.toString(),
        );
        const inspectionMaterialIds = items.map(
          (item) => item.materialInstanceId,
        );

        const missingMaterials = loanMaterialIds.filter(
          (id) => !inspectionMaterialIds.includes(id),
        );

        if (missingMaterials.length > 0) {
          throw AppError.badRequest("All loan materials must be inspected", {
            missingMaterialIds: missingMaterials,
          });
        }

        // Calculate total damage cost
        const totalDamageCost = items.reduce(
          (sum, item) => sum + (item.damageCost ?? 0),
          0,
        );

        // Create inspection with proper items format
        const inspectionItems = items.map((item) => ({
          materialInstanceId: new Types.ObjectId(item.materialInstanceId),
          conditionBefore: "good", // Default, would be populated from loan data in real impl
          conditionAfter: item.condition,
          damageDescription: item.damageDescription,
          chargeToCustomer: item.damageCost ?? 0,
          repairRequired: item.condition === "damaged",
        }));

        const [inspection]: any = await (Inspection as any).create(
          [
            {
              organizationId,
              loanId: new Types.ObjectId(loanId),
              inspectedBy: new Types.ObjectId(userId),
              items: inspectionItems,
              notes: overallNotes || null,
              status: "completed",
            },
          ],
          { session },
        );

        // If there are damages, create an invoice
        const damagedItems = items.filter(
          (item) => item.condition === "damaged" || item.condition === "lost",
        );

        if (damagedItems.length > 0 && totalDamageCost > 0) {
          const invoiceLineItems = damagedItems.map((item) => ({
            description:
              item.damageDescription ??
              `${item.condition === "lost" ? "Lost" : "Damaged"} material`,
            quantity: 1,
            unitPrice: item.damageCost ?? 0,
            totalPrice: item.damageCost ?? 0,
            referenceId: new Types.ObjectId(item.materialInstanceId),
            referenceType: "MaterialInstance" as const,
          }));

          await Invoice.create(
            [
              {
                organizationId,
                customerId: loan.customerId,
                loanId: loan._id,
                inspectionId: inspection._id,
                type: "damage",
                lineItems: invoiceLineItems,
                subtotal: totalDamageCost,
                taxRate: 0.19, // 19% tax (Colombian IVA)
                taxAmount: totalDamageCost * 0.19,
                totalAmount: totalDamageCost * 1.19,
                status: "pending",
                dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
                createdBy: new Types.ObjectId(userId),
                invoiceNumber: `INV-${Date.now()}`,
              },
            ],
            { session },
          );
        }

        const populatedInspection = await Inspection.findById(inspection._id)
          .session(session)
          .populate("loanId", "customerId startDate endDate")
          .populate("items.materialInstanceId", "serialNumber modelId");

        result = {
          inspection: populatedInspection,
          totalDamageCost,
        };
      });

      return result;
    } finally {
      await session.endSession();
    }
  },
};
