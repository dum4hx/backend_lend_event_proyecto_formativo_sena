import type { Types } from "mongoose";
import type { SubscriptionPlan } from "../models/organization.model.ts";

/* ---------- Organization Context ---------- */

export interface OrganizationContext {
  organizationId: Types.ObjectId;
  plan: SubscriptionPlan;
  seatCount: number;
  catalogItemCount: number;
}

/* ---------- Plan Usage ---------- */

export interface PlanUsage {
  currentCatalogItems: number;
  maxCatalogItems: number;
  currentSeats: number;
  maxSeats: number;
  canAddCatalogItem: boolean;
  canAddSeat: boolean;
}
