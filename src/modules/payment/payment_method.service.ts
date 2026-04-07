import { Types, type ClientSession } from "mongoose";
import {
  PaymentMethod,
  type PaymentMethodInput,
} from "./models/payment_method.model.ts";
import { AppError } from "../../errors/AppError.ts";

/** Maps a Mongoose document to a plain DTO. */
function toDTO(m: InstanceType<typeof PaymentMethod>) {
  const obj = m.toObject();
  return {
    id: obj._id,
    name: obj.name,
    description: obj.description as string | undefined,
    status: obj.status,
    isDefault: obj.isDefault,
    createdAt: obj.createdAt as Date | undefined,
    updatedAt: obj.updatedAt as Date | undefined,
  };
}

/**
 * Seeds the default payment methods for a newly registered organization.
 * Called inside the registration transaction.
 */
async function seedDefaultPaymentMethods(
  organizationId: Types.ObjectId,
  session?: ClientSession,
): Promise<void> {
  const existing = await PaymentMethod.findOne({
    organizationId,
    isDefault: true,
  }).session(session ?? null);

  if (existing) return; // Already seeded â€” idempotent

  const doc = new PaymentMethod({
    organizationId,
    name: "Efectivo",
    description: "Pago en efectivo / Cash payment",
    status: "active",
    isDefault: true,
  });
  await doc.save({ session: session ?? null });
}

/**
 * Returns all active payment methods for an organization, sorted by name.
 */
async function listPaymentMethods(organizationId: Types.ObjectId) {
  const methods = await PaymentMethod.find({
    organizationId,
    status: "active",
  }).sort({ name: 1 });

  return methods.map(toDTO);
}

/**
 * Creates a new payment method for the organization.
 */
async function createPaymentMethod(
  organizationId: Types.ObjectId,
  data: PaymentMethodInput,
) {
  const duplicate = await PaymentMethod.findOne({
    organizationId,
    name: data.name,
  });
  if (duplicate) {
    throw AppError.conflict(
      `Ya existe un método de pago llamado "${data.name}" en esta organización`,
    );
  }

  const doc = new PaymentMethod({
    organizationId,
    name: data.name,
    ...(data.description != null ? { description: data.description } : {}),
    status: data.status ?? "active",
    isDefault: false,
  });
  await doc.save();

  return toDTO(doc);
}

/**
 * Updates a payment method.
 * The `name` of default (seeded) methods cannot be changed.
 */
async function updatePaymentMethod(
  id: string,
  organizationId: Types.ObjectId,
  data: Partial<PaymentMethodInput>,
) {
  const method = await PaymentMethod.findOne({ _id: id, organizationId });
  if (!method) {
    throw AppError.notFound("Método de pago no encontrado");
  }

  if (method.isDefault && data.name && data.name !== method.name) {
    throw AppError.badRequest(
      "No se puede cambiar el nombre de un método de pago predeterminado",
    );
  }

  if (data.name && data.name !== method.name) {
    const duplicate = await PaymentMethod.findOne({
      organizationId,
      name: data.name,
      _id: { $ne: method._id },
    });
    if (duplicate) {
      throw AppError.conflict(
        `Ya existe un método de pago llamado "${data.name}" en esta organización`,
      );
    }
  }

  if (data.name !== undefined) method.name = data.name;
  if (data.description !== undefined)
    method.description = data.description ?? null;
  if (data.status !== undefined) method.status = data.status;

  await method.save();

  return toDTO(method);
}

/**
 * Soft-deletes a payment method by setting its status to "inactive".
 */
async function deactivatePaymentMethod(
  id: string,
  organizationId: Types.ObjectId,
) {
  const method = await PaymentMethod.findOne({ _id: id, organizationId });
  if (!method) {
    throw AppError.notFound("Método de pago no encontrado");
  }

  if (method.status === "inactive") {
    throw AppError.badRequest("El método de pago ya está inactivo");
  }

  method.status = "inactive";
  await method.save();

  return { id: method._id, status: method.status };
}

export const paymentMethodService = {
  seedDefaultPaymentMethods,
  listPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deactivatePaymentMethod,
};
