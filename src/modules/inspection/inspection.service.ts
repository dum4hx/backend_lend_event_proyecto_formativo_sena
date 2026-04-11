import { Types, startSession } from "mongoose";
import { Inspection } from "./models/inspection.model.ts";
import { Loan } from "../loan/models/loan.model.ts";
import { Invoice } from "../invoice/models/invoice.model.ts";
import { invoiceService } from "../invoice/invoice.service.ts";
import { Organization } from "../organization/models/organization.model.ts";
import { AppError } from "../../errors/AppError.ts";
import { isConditionDegraded } from "../shared/condition_levels.ts";
import {
  validateTransition,
  LOAN_TRANSITIONS,
} from "../shared/state_machine.ts";
import { conditionAfterToInstanceStatus } from "../shared/instance_status_mapper.ts";
import { materialService } from "../material/material.service.ts";
import { codeGenerationService } from "../code_scheme/code_generation.service.ts";

/**
 * Transforms inspection document to convert roleId -> role, name -> profile, and modelId -> materialType
 */
function transformInspection(inspection: any) {
  const inspectionObj = inspection.toObject ? inspection.toObject() : inspection;
  
  // Transform inspectedBy.name -> inspectedBy.profile and inspectedBy.roleId -> inspectedBy.role
  if (inspectionObj.inspectedBy) {
    // Convert name -> profile
    if (inspectionObj.inspectedBy.name) {
      inspectionObj.inspectedBy.profile = inspectionObj.inspectedBy.name;
      delete inspectionObj.inspectedBy.name;
    }
    
    // Convert roleId -> role
    if (inspectionObj.inspectedBy.roleId) {
      inspectionObj.inspectedBy.role = inspectionObj.inspectedBy.roleId;
      delete inspectionObj.inspectedBy.roleId;
    }
  }
  
  // Transform items[].materialInstanceId.modelId -> items[].materialType
  if (inspectionObj.items && Array.isArray(inspectionObj.items)) {
    inspectionObj.items = inspectionObj.items.map((item: any) => {
      if (item.materialInstanceId?.modelId) {
        item.materialType = item.materialInstanceId.modelId;
        delete item.materialInstanceId.modelId;
      }
      return item;
    });
  }
  
  return inspectionObj;
}

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
        .populate("loanId", "customerId startDate endDate code")
        .populate({
          path: "inspectedBy",
          select: "email name roleId",
          populate: {
            path: "roleId",
            select: "name",
          },
        })
        .populate({
          path: "items.materialInstanceId",
          select: "serialNumber modelId",
          populate: {
            path: "modelId",
            select: "_id name",
          },
        })
        .sort({ createdAt: -1 }),
      Inspection.countDocuments(query),
    ]);

    return {
      inspections: inspections.map(transformInspection),
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
      .populate({
        path: "inspectedBy",
        select: "email name roleId",
        populate: {
          path: "roleId",
          select: "name",
        },
      })
      .populate({
        path: "items.materialInstanceId",
        select: "serialNumber modelId",
        populate: {
          path: "modelId",
          select: "_id name",
        },
      });

    if (!inspection) {
      throw AppError.notFound("Inspección no encontrada");
    }

    return transformInspection(inspection);
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
    dueDate?: string | Date;
  }) {
    const { organizationId, userId, loanId, items, overallNotes, dueDate } =
      params;

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
          throw AppError.notFound(
            "Préstamo no encontrado o no está en estado de devuelto",
          );
        }

        // Check if inspection already exists
        const existingInspection = await Inspection.findOne({
          loanId: loan._id,
        }).session(session);
        if (existingInspection) {
          throw AppError.conflict(
            "Ya existe una inspección para este préstamo",
          );
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
          throw AppError.badRequest(
            "Todos los materiales del préstamo deben ser inspeccionados",
            {
              missingMaterialIds: missingMaterials,
            },
          );
        }

        // Calculate total damage cost
        const totalDamageCost = items.reduce(
          (sum, item) => sum + (item.damageCost ?? 0),
          0,
        );

        // Create inspection with proper items format
        const inspectionItems = items.map((item) => {
          // Look up real condition at checkout from loan data
          const loanMaterial = loan.materialInstances.find(
            (mi: any) =>
              mi.materialInstanceId.toString() === item.materialInstanceId,
          );
          const conditionBefore =
            (loanMaterial as any)?.conditionAtCheckout ?? "good";

          return {
            materialInstanceId: new Types.ObjectId(item.materialInstanceId),
            conditionBefore,
            conditionAfter: item.condition,
            conditionDegraded: isConditionDegraded(
              conditionBefore,
              item.condition,
            ),
            damageDescription: item.damageDescription,
            chargeToCustomer: item.damageCost ?? 0,
            repairRequired: item.condition === "damaged",
            transitionedToStatus:
              conditionAfterToInstanceStatus(item.condition) ?? undefined,
          };
        });

        const inspectionNumber = await codeGenerationService.generateCode({
          organizationId: String(organizationId),
          entityType: "inspection",
          context: {
            ...(loan.locationId ? { locationId: loan.locationId } : {}),
          },
          session,
        });

        const [inspection]: any = await (Inspection as any).create(
          [
            {
              organizationId,
              inspectionNumber,
              loanId: new Types.ObjectId(loanId),
              inspectedBy: new Types.ObjectId(userId),
              items: inspectionItems,
              notes: overallNotes || null,
              status: "completed",
            },
          ],
          { session },
        );

        // Transition each material instance status according to its inspected condition
        for (const item of items) {
          const targetStatus = conditionAfterToInstanceStatus(item.condition);
          if (targetStatus) {
            await materialService.updateInstanceStatus(
              organizationId,
              item.materialInstanceId,
              targetStatus,
              item.damageDescription ?? `Estado actualizado por inspección`,
              userId,
              "system",
            );
          }
        }

        // If there are damages, create an invoice
        const damagedItems = items.filter(
          (item) => item.condition === "damaged" || item.condition === "lost",
        );

        if (dueDate && damagedItems.length === 0) {
          throw AppError.badRequest(
            "Se proporcionó dueDate pero no hay artículos dañados; dueDate solo se permite cuando se generará una factura por daños",
          );
        }

        if (damagedItems.length > 0 && totalDamageCost > 0) {
          // determine invoice due date
          let invoiceDueDate: Date;
          if (dueDate) {
            invoiceDueDate = new Date(dueDate as any);
            if (isNaN(invoiceDueDate.getTime())) {
              throw AppError.badRequest(
                "Formato de fecha de vencimiento no válido",
              );
            }
          } else {
            // Use org-level policy for damage due days
            const org = await Organization.findById(organizationId)
              .select("settings")
              .session(session);
            const damageDueDays = org?.settings?.damageDueDays ?? 30;
            invoiceDueDate = new Date(
              Date.now() + damageDueDays * 24 * 60 * 60 * 1000,
            );
          }
          const invoiceLineItems = damagedItems.map((item) => ({
            description:
              item.damageDescription ??
              `Material ${item.condition === "lost" ? "perdido" : "dañado"}`,
            quantity: 1,
            unitPrice: item.damageCost ?? 0,
            totalPrice: item.damageCost ?? 0,
            referenceId: new Types.ObjectId(item.materialInstanceId),
            referenceType: "MaterialInstance" as const,
          }));

          const invoiceNumber = await codeGenerationService.generateCode({
            organizationId: String(organizationId),
            entityType: "invoice",
            context: {
              ...(loan.locationId ? { locationId: loan.locationId } : {}),
            },
            session,
          });
          const invoiceTotal = totalDamageCost * 1;

          const [createdInvoice]: any = await (Invoice as any).create(
            [
              {
                organizationId,
                customerId: loan.customerId,
                loanId: loan._id,
                inspectionId: inspection._id,
                type: "damage",
                lineItems: invoiceLineItems,
                subtotal: totalDamageCost,
                taxRate: 0,
                taxAmount: 0,
                totalAmount: invoiceTotal,
                status: "pending",
                dueDate: invoiceDueDate,
                createdBy: new Types.ObjectId(userId),
                invoiceNumber,
              },
            ],
            { session },
          );

          // Update loan financial summary with damage costs
          (loan as any).damageFees = totalDamageCost;
          loan.totalAmount = (loan.totalAmount ?? 0) + totalDamageCost;

          // Auto-apply deposit to the invoice if one exists
          const loanDeposit = (loan as any).deposit;
          const depositAmt: number = loanDeposit?.amount ?? 0;

          if (depositAmt > 0) {
            const depositApplied = Math.min(depositAmt, invoiceTotal);
            const invoiceDoc = await Invoice.findById(
              createdInvoice._id,
            ).session(session);

            if (invoiceDoc) {
              invoiceService.applyDepositPayment(
                invoiceDoc,
                depositApplied,
                `Depósito aplicado a la factura ${invoiceNumber}`,
              );
              await invoiceDoc.save({ session });
            }

            // Update loan deposit lifecycle
            const newDepositStatus =
              depositApplied >= depositAmt ? "applied" : "partially_applied";
            loanDeposit.transactions.push({
              type: "applied",
              amount: depositApplied,
              date: new Date(),
              reference: `Aplicado a la factura ${invoiceNumber}`,
            });
            loanDeposit.status = newDepositStatus;
            await loan.save({ session });
          } else {
            // No deposit — still need to persist the loan financial update
            await loan.save({ session });
          }
        } else if (totalDamageCost === 0) {
          // No damages — mark deposit as pending physical refund
          const loanDeposit = (loan as any).deposit;
          const depositAmt: number = loanDeposit?.amount ?? 0;

          if (depositAmt > 0) {
            loanDeposit.transactions.push({
              type: "refund",
              amount: depositAmt,
              date: new Date(),
              reference:
                "Sin daños encontrados — depósito pendiente de reembolso físico",
            });
            loanDeposit.status = "refund_pending";
          }

          // Auto-transition loan to inspected on clean inspection
          validateTransition(loan.status, "inspected", LOAN_TRANSITIONS);
          loan.status = "inspected";
          await loan.save({ session });
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
