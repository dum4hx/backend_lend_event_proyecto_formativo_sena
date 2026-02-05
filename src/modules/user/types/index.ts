import type { Types } from "mongoose";
import type { UserRole } from "../models/user.model.ts";

/* ---------- Auth User (JWT Payload) ---------- */

export interface AuthUser {
  userId: Types.ObjectId;
  organizationId: Types.ObjectId;
  role: UserRole;
  email: string;
}

/* ---------- JWT Token Payload ---------- */

export interface JWTPayload {
  sub: string; // userId
  org: string; // organizationId
  role: UserRole;
  email: string;
  iat: number;
  exp: number;
}

/* ---------- Invite User Request ---------- */

export interface InviteUserRequest {
  email: string;
  name: {
    firstName: string;
    secondName?: string;
    firstSurname: string;
    secondSurname?: string;
  };
  phone: string;
  role: UserRole;
}
