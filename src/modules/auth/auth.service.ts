import * as argon2 from "argon2";
import { Types, startSession } from "mongoose";
import {
  User,
  type UserInput,
  type UserRole,
} from "../user/models/user.model.ts";
import { AppError } from "../../errors/AppError.ts";
import { generateTokenPair, type TokenPair } from "../../utils/auth/jwt.ts";
import {
  Organization,
  type OrganizationInput,
} from "../organization/models/organization.model.ts";
import { organizationService } from "../organization/organization.service.ts";
import { logger } from "../../utils/logger.ts";
import type { ClientSession } from "mongoose";

/* ---------- Auth Service ---------- */

export const authService = {
  /**
   * Registers a new organization with an owner account.
   * Creates both organization and owner user in a transaction.
   */
  async register(
    organizationData: Omit<OrganizationInput, "ownerId">,
    ownerData: Omit<UserInput, "organizationId" | "role">,
  ): Promise<{
    organization: InstanceType<typeof Organization>;
    user: InstanceType<typeof User>;
    tokens: TokenPair;
  }> {
    const session = await startSession();

    return await session.withTransaction(async () => {
      // Check if email already exists for user
      const existingUser = await User.findOne({
        email: ownerData.email.trim().toLowerCase(),
      }).session(session);
      if (existingUser) {
        throw AppError.conflict("A user with this email already exists");
      }

      // Create a temporary ObjectId for the owner
      const ownerId = new Types.ObjectId();

      // Create organization - cast to any to work around exactOptionalPropertyTypes
      const orgDoc = new Organization({
        ...organizationData,
        ownerId,
      });
      const organization = await orgDoc.save({ session });

      // Create owner user
      const userDoc = new User({
        _id: ownerId,
        ...ownerData,
        organizationId: organization._id,
        role: "owner" as UserRole,
        status: "active",
      });
      const user = await userDoc.save({ session });

      // Generate tokens
      const tokens = await generateTokenPair({
        sub: user._id.toString(),
        org: organization._id.toString(),
        role: "owner",
        email: user.email,
      });

      await session.commitTransaction();

      logger.info("Organization registered", {
        organizationId: organization._id.toString(),
        ownerId: user._id.toString(),
      });

      return Promise.resolve({ organization, user, tokens });
    });
  },

  /**
   * Authenticates a user with email and password.
   */
  async login(
    email: string,
    password: string,
  ): Promise<{ user: InstanceType<typeof User>; tokens: TokenPair }> {
    // Find user with password field
    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .select("+password")
      .populate("organizationId", "status");

    if (!user) {
      throw AppError.unauthorized("Invalid email or password");
    }

    // Verify password
    const isValidPassword = await argon2.verify(user.password, password);
    if (!isValidPassword) {
      throw AppError.unauthorized("Invalid email or password");
    }

    // Check user status
    if (user.status === "suspended") {
      throw AppError.unauthorized("Your account has been suspended");
    }

    if (user.status === "inactive") {
      throw AppError.unauthorized("Your account is inactive");
    }

    // Check organization status
    const org = user.organizationId as unknown as { status: string };
    if (org?.status === "suspended") {
      throw AppError.unauthorized(
        "Organization is suspended. Please contact the organization owner.",
        { code: "ORGANIZATION_SUSPENDED" },
      );
    }

    if (org?.status === "cancelled") {
      throw AppError.unauthorized(
        "Organization subscription has been cancelled.",
        { code: "ORGANIZATION_CANCELLED" },
      );
    }

    // Update last login
    await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });

    // Generate tokens
    const tokens = await generateTokenPair({
      sub: user._id.toString(),
      org: user.organizationId.toString(),
      role: user.role as UserRole,
      email: user.email,
    });

    logger.info("User logged in", { userId: user._id.toString() });

    // Remove password from response
    user.password = undefined as unknown as string;

    return { user, tokens };
  },

  /**
   * Refreshes access token using refresh token.
   */
  async refreshTokens(
    userId: string,
    organizationId: string,
  ): Promise<TokenPair> {
    const user = await User.findById(userId);
    if (!user) {
      throw AppError.unauthorized("User not found");
    }

    if (user.status !== "active") {
      throw AppError.unauthorized("Account is not active");
    }

    return generateTokenPair({
      sub: user._id.toString(),
      org: organizationId,
      role: user.role as UserRole,
      email: user.email,
    });
  },

  /**
   * Invites a new user to an organization.
   */
  async inviteUser(
    organizationId: Types.ObjectId | string,
    invitedBy: Types.ObjectId | string,
    userData: Omit<UserInput, "organizationId" | "password">,
    temporaryPassword: string,
  ): Promise<InstanceType<typeof User>> {
    // Check if organization can add more seats
    const canAddSeat = await organizationService.canAddSeat(organizationId);
    if (!canAddSeat) {
      throw AppError.badRequest(
        "Seat limit reached. Please upgrade your plan to add more users.",
        { code: "PLAN_LIMIT_REACHED", resource: "seats" },
      );
    }

    // Check if user already exists in org
    const existingUser = await User.findOne({
      organizationId,
      email: userData.email.toLowerCase(),
    });

    if (existingUser) {
      throw AppError.conflict(
        "A user with this email already exists in this organization",
      );
    }

    const userDoc = new User({
      ...userData,
      organizationId,
      password: temporaryPassword,
      status: "invited",
      invitedAt: new Date(),
      invitedBy,
    });
    const user = await userDoc.save();

    // Update seat count
    const org = await Organization.findById(organizationId);
    if (org) {
      const currentSeats = org.subscription?.seatCount ?? 1;
      await organizationService.updateSeatCount(
        organizationId,
        currentSeats + 1,
      );
    }

    logger.info("User invited", {
      organizationId: organizationId.toString(),
      userId: user._id.toString(),
      invitedBy: invitedBy.toString(),
    });

    return user;
  },

  /**
   * Activates an invited user account.
   */
  async activateInvitedUser(
    userId: Types.ObjectId | string,
    newPassword: string,
  ): Promise<InstanceType<typeof User>> {
    const user = await User.findById(userId);
    if (!user) {
      throw AppError.notFound("User not found");
    }

    if (user.status !== "invited") {
      throw AppError.badRequest("User is not in invited status");
    }

    user.password = newPassword;
    user.status = "active";
    await user.save();

    logger.info("Invited user activated", { userId: userId.toString() });

    return user;
  },

  /**
   * Changes user password.
   */
  async changePassword(
    userId: Types.ObjectId | string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await User.findById(userId).select("+password");
    if (!user) {
      throw AppError.notFound("User not found");
    }

    // Verify current password
    const isValid = await argon2.verify(user.password, currentPassword);
    if (!isValid) {
      throw AppError.unauthorized("Current password is incorrect");
    }

    user.password = newPassword;
    await user.save();

    logger.info("Password changed", { userId: userId.toString() });
  },
};
