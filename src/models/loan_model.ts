import { z } from "zod";
import { Schema, model, type InferSchemaType, Types } from "mongoose";

// Loan statuses
const loanStatusOptions: string[] = [
  "pending",
  "approved",
  "active",
  "returned",
  "overdue",
  "cancelled",
];

// Material instance in loan
const loanMaterialInstanceSchema = new Schema(
  {
    materialInstanceId: {
      type: Schema.Types.ObjectId,
      ref: "MaterialInstance",
      required: true,
    },
    modelId: {
      type: Schema.Types.ObjectId,
      ref: "MaterialModel",
      required: true,
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  {
    _id: false,
  },
);

// Zod schema for API validation
const loanMaterialInstanceInput = z.object({
  materialInstanceId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Material Instance ID format",
  }),
  modelId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Material Model ID format",
  }),
  quantity: z.number().positive("Quantity must be greater than 0").default(1),
});

export const LoanZodSchema = z.object({
  borrowerId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Borrower ID format",
  }),
  asesorId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Asesor ID format",
  }),
  sedeId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Location ID format",
  }),
  planIds: z.array(
    z.string().refine((val) => Types.ObjectId.isValid(val), {
      message: "Invalid Plan ID format",
    }),
  ),
  depositAmount: z.number().positive("Deposit amount must be greater than 0"),
  dueDate: z.iso.datetime("Invalid date format"),
  contractUrl: z.url("Must be a valid URL"),
  status: z
    .enum(["pending", "approved", "active", "returned", "overdue", "cancelled"])
    .default("pending"),
  materialInstances: z
    .array(loanMaterialInstanceInput)
    .min(1, "At least one material instance is required"),
  paymentMethodId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid Payment Method ID format",
  }),
});

export type LoanInput = z.infer<typeof LoanZodSchema>;

// Loan mongoose schema
const loanSchema = new Schema(
  {
    borrowerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    asesorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sedeId: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      required: true,
    },
    planIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "MaterialPlan",
      },
    ],
    depositAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    damageFees: {
      type: Number,
      default: 0,
      min: 0,
    },
    lateFees: {
      type: Number,
      default: 0,
      min: 0,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    returnedAt: {
      type: Date,
      default: null,
    },
    contractUrl: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => /^https?:\/\/.+/.test(v),
        message: "Must be a valid URL",
      },
    },
    status: {
      type: String,
      enum: loanStatusOptions,
      default: "pending",
      index: true,
    },
    materialInstances: [loanMaterialInstanceSchema],
    paymentMethodId: {
      type: Schema.Types.ObjectId,
      ref: "PaymentMethod",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for better query performance
loanSchema.index({ borrowerId: 1 });
loanSchema.index({ asesorId: 1 });
loanSchema.index({ sedeId: 1 });
loanSchema.index({ status: 1, dueDate: 1 });
loanSchema.index({ createdAt: 1 });

// Middleware to update status based on dates
loanSchema.pre("save", function (next) {
  const now = new Date();

  // Update status if it's active and due date has passed and not returned
  if (this.status === "active" && this.dueDate < now && !this.returnedAt) {
    this.status = "overdue";
  }

  // Set status to returned if returnedAt is set
  if (this.returnedAt && this.status !== "returned") {
    this.status = "returned";
  }
});

export type LoanDocument = InferSchemaType<typeof loanSchema>;
export const Loan = model<LoanDocument>("Loan", loanSchema);
