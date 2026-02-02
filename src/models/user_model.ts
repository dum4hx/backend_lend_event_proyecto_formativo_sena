import { z } from "zod";
import * as argon2 from "argon2";

import {
  Schema,
  model,
  type InferSchemaType,
  Types,
  type ValidatorProps,
} from "mongoose";
import { AppError } from "../utils/types/AppError.ts";

// User roles
const userRoles: string[] = [
  "admin",
  "location_manager",
  "store_operator",
  "commercial_advisor",
  "user",
];

// Zod schema for API validation
const namePart = z.string().max(50, "Maximum 50 characters allowed").trim();
const requiredNamePart = namePart.min(1, "This field is required");

export const UserZodSchema = z.object({
  name: z.object({
    firstName: requiredNamePart,
    secondName: namePart.optional().or(z.literal("")),
    firstSurname: requiredNamePart,
    secondSurname: namePart.optional().or(z.literal("")),
  }),
  email: z.string().email("Invalid email format").lowercase().trim(),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone format (E.164)"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  roles: z.array(z.enum(userRoles)).default(["user"]),
  locationIds: z.array(
    z.string().refine((val) => Types.ObjectId.isValid(val), {
      message: "Invalid Location ID format",
    }),
  ),
});

// Create a type for TypeScript logic
export type UserInput = z.infer<typeof UserZodSchema>;

// User name field schema
const userNameSchema = new Schema(
  {
    name: {
      firstName: {
        type: String,
        required: true,
        maxlength: 50,
        trim: true,
      },
      secondName: {
        type: String,
        required: false,
        maxlength: 50,
        trim: true,
      },
      firstSurname: {
        type: String,
        required: true,
        maxlength: 50,
        trim: true,
      },
      secondSurname: {
        type: String,
        required: false,
        maxlength: 50,
        trim: true,
      },
    },
  },
  {
    _id: false,
  },
);

// User mongoose schema
const userSchema = new Schema(
  {
    name: userNameSchema,
    email: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: (v: string) =>
          UserZodSchema.shape.email.safeParse(v).success,
        message: (props: ValidatorProps) =>
          `${props.value} is not a valid email!`,
      },
    },
    phone: { type: String, required: true },
    password: { type: String, required: true, select: false },
    roles: {
      type: [String],
      enum: userRoles,
      default: ["user"],
    },
    locationIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Location",
        required: true,
      },
    ],
  },
  {
    timestamps: true,
  },
);

userSchema.pre("save", async function (next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified("password")) {
    return;
  }

  try {
    // Save password as hash
    this.password = await argon2.hash(this.password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64MB
      timeCost: 3, // Number of iterations
      parallelism: 1, // Number of threads
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw AppError.internal("Error while hashing password", err.cause);
    }
  }
});

// Infer the document type from the schema
export type UserDocument = InferSchemaType<typeof userSchema>;
export const User = model<UserDocument>("User", userSchema);
