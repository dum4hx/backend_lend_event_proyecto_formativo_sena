import { Types, type ClientSession } from "mongoose";
import {
  PricingConfig,
  type PricingConfigDocument,
  type PricingConfigCreateInput,
  type PricingConfigUpdateInput,
} from "./models/pricing_config.model.ts";
import { MaterialModel } from "../material/models/material_type.model.ts";
import { Package } from "../package/models/package.model.ts";
import { AppError } from "../../errors/AppError.ts";
import { logger } from "../../utils/logger.ts";

/* ---------- Types ---------- */

interface CalculateItemPriceInput {
  strategyType: string;
  config: PricingConfigDocument | null;
  durationInDays: number;
  basePricePerDay: number;
  quantity: number;
}

interface CalculateItemPriceResult {
  unitPrice: number;
  totalPrice: number;
  effectivePricePerDay: number;
}

interface LoanPricingSnapshotEntry {
  itemType: "material" | "package";
  referenceId: Types.ObjectId;
  quantity: number;
  strategyType: string;
  configId?: Types.ObjectId;
  durationInDays: number;
  basePricePerDay: number;
  unitPrice: number;
  totalPrice: number;
}

/* ---------- Pure Calculation Logic ---------- */

/**
 * Computes the price for a single item using the resolved pricing strategy.
 * Duration is always rounded up to the next full day; minimum is 1 day.
 */
function calculateItemPrice({
  strategyType,
  config,
  durationInDays,
  basePricePerDay,
  quantity,
}: CalculateItemPriceInput): CalculateItemPriceResult {
  const duration = Math.max(1, Math.ceil(durationInDays));

  let unitPrice: number;
  let effectivePricePerDay: number;

  switch (strategyType) {
    case "fixed": {
      const flatPrice = config?.fixedParams?.flatPrice ?? basePricePerDay;
      unitPrice = flatPrice;
      effectivePricePerDay = flatPrice / duration;
      break;
    }

    case "weekly_monthly": {
      const p = config?.weeklyMonthlyParams;
      const pricePerDay =
        config?.perDayParams?.overridePricePerDay ?? basePricePerDay;
      const weeklyThreshold = p?.weeklyThreshold ?? 7;
      const monthlyThreshold = p?.monthlyThreshold ?? 30;

      const monthlyPrice = p?.monthlyPrice;
      const weeklyPrice = p?.weeklyPrice;

      if (monthlyPrice != null && duration >= monthlyThreshold) {
        const fullMonths = Math.floor(duration / 30);
        const remainingDays = duration % 30;
        unitPrice = fullMonths * monthlyPrice + remainingDays * pricePerDay;
      } else if (weeklyPrice != null && duration >= weeklyThreshold) {
        const fullWeeks = Math.floor(duration / 7);
        const remainingDays = duration % 7;
        unitPrice = fullWeeks * weeklyPrice + remainingDays * pricePerDay;
      } else {
        // Fall back to per-day when duration doesn't meet any threshold
        unitPrice = duration * pricePerDay;
      }

      effectivePricePerDay = unitPrice / duration;
      break;
    }

    case "per_day":
    default: {
      const pricePerDay =
        config?.perDayParams?.overridePricePerDay ?? basePricePerDay;
      unitPrice = duration * pricePerDay;
      effectivePricePerDay = pricePerDay;
      break;
    }
  }

  return {
    unitPrice,
    totalPrice: unitPrice * quantity,
    effectivePricePerDay,
  };
}

/* ---------- Pricing Service ---------- */

export const pricingService = {
  /* ----- Config Resolution ----- */

  /**
   * Resolves the pricing config for an item.
   * Checks item-level config first, then falls back to org-level default.
   * Returns null if no config exists at either level.
   */
  async resolveItemPricingConfig(
    organizationId: Types.ObjectId | string,
    scope: "materialType" | "package",
    referenceId: Types.ObjectId | string,
  ): Promise<PricingConfigDocument | null> {
    const orgId = new Types.ObjectId(organizationId.toString());
    const refId = new Types.ObjectId(referenceId.toString());

    // 1. Try item-level config
    const itemConfig = await PricingConfig.findOne({
      organizationId: orgId,
      scope,
      referenceId: refId,
    }).lean();

    if (itemConfig) {
      return itemConfig as unknown as PricingConfigDocument;
    }

    // 2. Fall back to org-level default
    const orgConfig = await PricingConfig.findOne({
      organizationId: orgId,
      scope: "organization",
      referenceId: orgId,
    }).lean();

    return (orgConfig as unknown as PricingConfigDocument) ?? null;
  },

  /* ----- Request Pricing ----- */

  /**
   * Calculates and mutates pricing fields on all items of a request.
   * Sets items[i].pricePerDay, items[i].totalPrice, items[i].pricingConfigId,
   * items[i].pricingStrategyType, request.subtotal, and request.totalAmount.
   *
   * The request is mutated in-place but NOT saved — the caller must save it.
   */
  async calculateRequestPricing(request: any): Promise<void> {
    const organizationId: Types.ObjectId = request.organizationId;
    const durationInDays: number = request.totalDays ?? 1;

    for (const item of request.items) {
      const itemType: "material" | "package" = item.type;
      const referenceId: Types.ObjectId = item.referenceId;
      const quantity: number = item.quantity ?? 1;

      // Resolve base price per day from the underlying entity
      let basePricePerDay = 0;
      const scope =
        itemType === "material"
          ? ("materialType" as const)
          : ("package" as const);

      if (itemType === "material") {
        const materialType = await MaterialModel.findOne({
          _id: referenceId,
          organizationId,
        })
          .select("pricePerDay")
          .lean();

        if (!materialType) {
          logger.warn("Material type not found during pricing calculation", {
            referenceId: referenceId.toString(),
          });
          basePricePerDay = 0;
        } else {
          basePricePerDay = (materialType as any).pricePerDay ?? 0;
        }
      } else {
        const pkg = await Package.findOne({
          _id: referenceId,
          organizationId,
        })
          .select("pricePerDay")
          .lean();

        if (!pkg) {
          logger.warn("Package not found during pricing calculation", {
            referenceId: referenceId.toString(),
          });
          basePricePerDay = 0;
        } else {
          basePricePerDay = (pkg as any).pricePerDay ?? 0;
        }
      }

      // Resolve config
      const config = await pricingService.resolveItemPricingConfig(
        organizationId,
        scope,
        referenceId,
      );

      const strategyType = config?.strategyType ?? "per_day";

      const { unitPrice, totalPrice, effectivePricePerDay } =
        calculateItemPrice({
          strategyType,
          config,
          durationInDays,
          basePricePerDay,
          quantity,
        });

      // Mutate the item subdocument
      item.pricePerDay = effectivePricePerDay;
      item.totalPrice = totalPrice;
      item.pricingConfigId = (config as any)?._id ?? undefined;
      item.pricingStrategyType = strategyType;
    }

    // Calculate totals
    const subtotal: number = request.items.reduce(
      (sum: number, item: any) => sum + (item.totalPrice ?? 0),
      0,
    );

    request.subtotal = subtotal;
    request.totalAmount = Math.max(0, subtotal - (request.discountAmount ?? 0));
  },

  /* ----- Loan Snapshot ----- */

  /**
   * Builds the pricingSnapshot array from a request whose items have already
   * been priced (i.e., after calculateRequestPricing has been called).
   * This is intentionally synchronous — no further DB queries needed.
   */
  buildLoanPricingSnapshot(request: any): LoanPricingSnapshotEntry[] {
    const durationInDays: number = request.totalDays ?? 1;

    return (request.items ?? []).map((item: any) => {
      const entry: LoanPricingSnapshotEntry = {
        itemType: item.type,
        referenceId: item.referenceId as Types.ObjectId,
        quantity: item.quantity ?? 1,
        strategyType: item.pricingStrategyType ?? "per_day",
        durationInDays,
        basePricePerDay: item.pricePerDay ?? 0,
        unitPrice: item.totalPrice ? item.totalPrice / (item.quantity ?? 1) : 0,
        totalPrice: item.totalPrice ?? 0,
      };

      if (item.pricingConfigId) {
        entry.configId = item.pricingConfigId as Types.ObjectId;
      }

      return entry;
    });
  },

  /* ----- Default Config Seeder ----- */

  /**
   * Idempotently seeds a default per-day pricing config for an organization.
   * Safe to call inside a transaction via the optional session parameter.
   */
  async seedDefaultPricingConfig(
    organizationId: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<void> {
    const orgId = new Types.ObjectId(organizationId.toString());

    await PricingConfig.findOneAndUpdate(
      {
        organizationId: orgId,
        scope: "organization",
        referenceId: orgId,
      },
      {
        $setOnInsert: {
          organizationId: orgId,
          scope: "organization",
          referenceId: orgId,
          strategyType: "per_day",
          perDayParams: {},
        },
      },
      {
        upsert: true,
        new: true,
        ...(session ? { session } : {}),
      },
    );

    logger.info("Default per-day pricing config seeded", {
      organizationId: orgId.toString(),
    });
  },

  /* ----- CRUD Methods ----- */

  /**
   * Lists all pricing configs for the given organization, sorted by scope.
   */
  async listPricingConfigs(
    organizationId: Types.ObjectId | string,
  ): Promise<PricingConfigDocument[]> {
    const orgId = new Types.ObjectId(organizationId.toString());
    const configs = await PricingConfig.find({ organizationId: orgId }).sort({
      scope: 1,
      createdAt: -1,
    });
    return configs as unknown as PricingConfigDocument[];
  },

  /**
   * Gets a single pricing config by ID, scoped to the organization.
   */
  async getPricingConfigById(
    organizationId: Types.ObjectId | string,
    configId: string,
  ): Promise<PricingConfigDocument> {
    if (!Types.ObjectId.isValid(configId)) {
      throw AppError.badRequest("Formato de ID de configuración de precios no válido");
    }

    const orgId = new Types.ObjectId(organizationId.toString());
    const config = await PricingConfig.findOne({
      _id: configId,
      organizationId: orgId,
    });

    if (!config) {
      throw AppError.notFound("Configuración de precios no encontrada");
    }

    return config as unknown as PricingConfigDocument;
  },

  /**
   * Creates a new pricing config for the organization.
   * Throws 409 if (organizationId, scope, referenceId) combination already exists.
   */
  async createPricingConfig(
    organizationId: Types.ObjectId | string,
    data: PricingConfigCreateInput,
  ): Promise<PricingConfigDocument> {
    const orgId = new Types.ObjectId(organizationId.toString());
    const refId = new Types.ObjectId(data.referenceId);

    // Guard: check for existing config with same scope + referenceId
    const existing = await PricingConfig.findOne({
      organizationId: orgId,
      scope: data.scope,
      referenceId: refId,
    });

    if (existing) {
      throw AppError.conflict(
        `Ya existe una configuración de precios para este ${data.scope}. Actualice la existente.`,
      );
    }

    const config = (await PricingConfig.create({
      organizationId: orgId,
      scope: data.scope,
      referenceId: refId,
      strategyType: data.strategyType,
      perDayParams: data.perDayParams ?? null,
      weeklyMonthlyParams: data.weeklyMonthlyParams ?? null,
      fixedParams: data.fixedParams ?? null,
    } as any)) as unknown as PricingConfigDocument & { _id: Types.ObjectId };

    logger.info("Pricing config created", {
      configId: config._id.toString(),
      organizationId: orgId.toString(),
      scope: data.scope,
      strategyType: data.strategyType,
    });

    return config as unknown as PricingConfigDocument;
  },

  /**
   * Updates an existing pricing config.
   * Cannot change scope or referenceId — those are structural.
   */
  async updatePricingConfig(
    organizationId: Types.ObjectId | string,
    configId: string,
    data: PricingConfigUpdateInput,
  ): Promise<PricingConfigDocument> {
    const config = await pricingService.getPricingConfigById(
      organizationId,
      configId,
    );

    const doc = config as any;

    if (data.strategyType !== undefined) {
      doc.strategyType = data.strategyType;
    }
    if (data.perDayParams !== undefined) {
      doc.perDayParams = data.perDayParams;
    }
    if (data.weeklyMonthlyParams !== undefined) {
      doc.weeklyMonthlyParams = data.weeklyMonthlyParams;
    }
    if (data.fixedParams !== undefined) {
      doc.fixedParams = data.fixedParams;
    }

    await doc.save();

    logger.info("Pricing config updated", {
      configId,
      organizationId: organizationId.toString(),
    });

    return doc as unknown as PricingConfigDocument;
  },

  /**
   * Deletes a pricing config.
   * The org-level default config (scope=organization) cannot be deleted.
   */
  async deletePricingConfig(
    organizationId: Types.ObjectId | string,
    configId: string,
  ): Promise<void> {
    const config = await pricingService.getPricingConfigById(
      organizationId,
      configId,
    );

    const doc = config as any;

    if (
      doc.scope === "organization" &&
      doc.referenceId.toString() === doc.organizationId.toString()
    ) {
      throw AppError.badRequest(
        "No se puede eliminar la configuración de precios predeterminada de la organización. Actualícela en su lugar.",
      );
    }

    await PricingConfig.deleteOne({ _id: configId });

    logger.info("Pricing config deleted", {
      configId,
      organizationId: organizationId.toString(),
    });
  },

  /* ----- Preview ----- */

  /**
   * Previews the price calculation for a given item + duration without persisting anything.
   */
  async previewPrice(
    organizationId: Types.ObjectId | string,
    itemType: "material" | "package",
    referenceId: string,
    quantity: number,
    durationInDays: number,
  ): Promise<{
    strategyType: string;
    configId?: string;
    basePricePerDay: number;
    durationInDays: number;
    unitPrice: number;
    totalPrice: number;
  }> {
    const orgId = new Types.ObjectId(organizationId.toString());
    const refId = new Types.ObjectId(referenceId);
    const scope =
      itemType === "material"
        ? ("materialType" as const)
        : ("package" as const);

    // Fetch base price
    let basePricePerDay = 0;

    if (itemType === "material") {
      const materialType = await MaterialModel.findOne({
        _id: refId,
        organizationId: orgId,
      })
        .select("pricePerDay")
        .lean();

      if (!materialType) {
        throw AppError.notFound("Tipo de material no encontrado");
      }
      basePricePerDay = (materialType as any).pricePerDay ?? 0;
    } else {
      const pkg = await Package.findOne({
        _id: refId,
        organizationId: orgId,
      })
        .select("pricePerDay")
        .lean();

      if (!pkg) {
        throw AppError.notFound("Paquete no encontrado");
      }
      basePricePerDay = (pkg as any).pricePerDay ?? 0;
    }

    const config = await pricingService.resolveItemPricingConfig(
      orgId,
      scope,
      refId,
    );

    const strategyType = config?.strategyType ?? "per_day";
    const { unitPrice, totalPrice } = calculateItemPrice({
      strategyType,
      config,
      durationInDays,
      basePricePerDay,
      quantity,
    });

    return {
      strategyType,
      configId: config ? (config as any)._id?.toString() : undefined,
      basePricePerDay,
      durationInDays: Math.max(1, Math.ceil(durationInDays)),
      unitPrice,
      totalPrice,
    };
  },
};
