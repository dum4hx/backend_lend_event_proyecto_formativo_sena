import * as argon2 from "argon2";
import { Types, startSession } from "mongoose";
import crypto from "node:crypto";
import {
  User,
  type UserInput,
  type UserRole,
} from "../user/models/user.model.ts";
import { AppError } from "../../errors/AppError.ts";
import { generateTokenPair, type TokenPair } from "../../utils/auth/jwt.ts";
import {
  Organization,
  type OrganizationDocument,
  type OrganizationInput,
} from "../organization/models/organization.model.ts";
import { SubscriptionType } from "../subscription_type/models/subscription_type.model.ts";
import { organizationService } from "../organization/organization.service.ts";
import { PasswordResetToken } from "./models/password_reset_token.model.ts";
import { InviteToken } from "./models/invite_token.model.ts";
import { emailService } from "../../utils/email.ts";
import { logger } from "../../utils/logger.ts";
import type { ClientSession } from "mongoose";

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const MAX_VERIFY_ATTEMPTS = 5;
const INVITE_EXPIRY_HOURS = parseInt(process.env.INVITE_EXPIRY_HOURS || "48", 10);
const FRONTEND_URL = process.env.FRONTEND_URL || "https://api.test.local";

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
      const orgData: Record<string, unknown> = {
        ...organizationData,
        ownerId,
      };

      // When SKIP_SUBSCRIPTION_CHECK is enabled, assign the starter plan
      if (process.env.SKIP_SUBSCRIPTION_CHECK === "true") {
        const starterPlan = await SubscriptionType.findOne({
          plan: "starter",
          status: "active",
        }).session(session);
        if (!starterPlan) {
          throw AppError.badRequest(
            "Starter subscription plan not found or inactive",
          );
        }
        orgData.subscription = {
          plan: starterPlan.plan,
          seatCount: starterPlan.maxSeats === -1 ? 1 : starterPlan.maxSeats,
          catalogItemCount: 0,
        };
      }

      const orgDoc = new Organization(orgData);
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
    const org = user.organizationId as unknown as { _id: Types.ObjectId; status: string };
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

    // Generate tokens - extract _id from populated organizationId
    const tokens = await generateTokenPair({
      sub: user._id.toString(),
      org: org._id.toString(),
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
   * Generates a secure invite token, sends an email with a link, and
   * creates the user in "invited" status.
   */
  async inviteUser(
    organizationId: Types.ObjectId | string,
    invitedBy: Types.ObjectId | string,
    userData: Omit<UserInput, "organizationId" | "password">,
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

    // Generate a placeholder password (user will set their own via invite link)
    const placeholderPassword = crypto.randomBytes(32).toString("hex");

    const userDoc = new User({
      ...userData,
      organizationId,
      password: placeholderPassword,
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

    // Generate invite token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    // Invalidate any previous invite tokens for this user
    await InviteToken.deleteMany({ userId: user._id });

    await InviteToken.create({
      userId: user._id,
      organizationId,
      email: userData.email.toLowerCase(),
      tokenHash,
      expiresAt: new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000),
    });

    // Build invite URL and send email
    const inviteUrl = `${FRONTEND_URL}/accept-invite?token=${rawToken}&email=${encodeURIComponent(userData.email.toLowerCase())}`;
    const orgName = org?.name ?? "your organization";

    await emailService.sendInviteEmail(
      userData.email,
      userData.name.firstName,
      orgName,
      inviteUrl,
      INVITE_EXPIRY_HOURS,
    );

    logger.info("User invited", {
      organizationId: organizationId.toString(),
      userId: user._id.toString(),
      invitedBy: invitedBy.toString(),
    });

    return user;
  },

  /**
   * Accepts an invite by validating the token and setting the user's password.
   */
  async acceptInvite(
    email: string,
    token: string,
    newPassword: string,
  ): Promise<InstanceType<typeof User>> {
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const inviteToken = await InviteToken.findOne({
      email: email.toLowerCase(),
      tokenHash,
    });

    if (!inviteToken) {
      throw AppError.badRequest(
        "Invalid or expired invite link. Please ask your administrator to send a new invitation.",
      );
    }

    if (inviteToken.expiresAt < new Date()) {
      await InviteToken.deleteOne({ _id: inviteToken._id });
      throw AppError.badRequest(
        "This invite link has expired. Please ask your administrator to send a new invitation.",
      );
    }

    const user = await User.findById(inviteToken.userId);
    if (!user) {
      throw AppError.notFound("User account not found");
    }

    if (user.status !== "invited") {
      throw AppError.badRequest("This account has already been activated");
    }

    user.password = newPassword;
    user.status = "active";
    await user.save();

    // Clean up the invite token
    await InviteToken.deleteMany({ userId: user._id });

    logger.info("Invited user activated via link", {
      userId: user._id.toString(),
      organizationId: user.organizationId.toString(),
    });

    return user;
  },

  /**
   * Resends an invite email with a fresh token for an already-invited user.
   */
  async resendInvite(
    organizationId: Types.ObjectId | string,
    userId: Types.ObjectId | string,
  ): Promise<void> {
    const user = await User.findOne({ _id: userId, organizationId });
    if (!user) {
      throw AppError.notFound("User not found in this organization");
    }

    if (user.status !== "invited") {
      throw AppError.badRequest(
        "Only users with invited status can receive a new invite",
      );
    }

    // Generate new token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    // Invalidate old tokens and create new one
    await InviteToken.deleteMany({ userId: user._id });

    await InviteToken.create({
      userId: user._id,
      organizationId,
      email: user.email.toLowerCase(),
      tokenHash,
      expiresAt: new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000),
    });

    const org = await Organization.findById(organizationId);
    const orgName = org?.name ?? "your organization";
    const inviteUrl = `${FRONTEND_URL}/accept-invite?token=${rawToken}&email=${encodeURIComponent(user.email.toLowerCase())}`;

    const firstName = user.name?.firstName ?? "there";

    await emailService.sendInviteEmail(
      user.email,
      firstName,
      orgName,
      inviteUrl,
      INVITE_EXPIRY_HOURS,
    );

    logger.info("Invite resent", {
      userId: user._id.toString(),
      organizationId: organizationId.toString(),
    });
  },

  /**
   * Checks if the user's organization is active and not suspended/cancelled.
   * Used for protecting routes that require an active organization.
   * Returns true if organization is active, otherwise throws an error.
   */
  async isActiveOrganization(userId: Types.ObjectId | string): Promise<{
    isActive: boolean;
    subscription: OrganizationDocument["subscription"] | null;
    status: string;
  }> {
    const response = {
      isActive: false,
      subscription: null as OrganizationDocument["subscription"] | null,
      status: "unknown" as string,
    };

    const { userService } = await import("../user/user.service.ts");

    const user = await userService.getProfile(userId);

    // Check if user is owner
    if (user.role !== "owner") {
      throw AppError.unauthorized(
        "Only organization owners can check payment status",
      );
    }

    // Get organization
    const organization = await Organization.findById(user.organizationId)
      .select("status subscription")
      .lean();

    if (!organization) {
      throw AppError.notFound("Organization not found");
    }

    response.status = organization.status;
    response.subscription = organization.subscription;

    if (organization.status !== "active") {
      return response;
    }

    // Check subscription expiration
    if (
      organization.subscription?.currentPeriodEnd &&
      organization.subscription.currentPeriodEnd < new Date()
    ) {
      await Organization.updateOne(
        { _id: user.organizationId },
        { status: "suspended" },
      );
      response.status = "suspended";
      return response;
    }

    response.isActive = true;
    return response;
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

  /**
   * Initiates a forgot-password flow.
   * Generates a 6-digit OTP, stores it hashed, and emails it to the user.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    // Always return success to prevent email enumeration
    if (!user) {
      logger.warn("Forgot password requested for unknown email", { email });
      return;
    }

    if (user.status === "suspended" || user.status === "inactive") {
      logger.warn("Forgot password requested for inactive/suspended user", {
        userId: user._id.toString(),
      });
      return;
    }

    // Invalidate previous tokens for this user
    await PasswordResetToken.deleteMany({ userId: user._id });

    // Generate a 6-digit numeric OTP
    const code = crypto
      .randomInt(0, 10 ** OTP_LENGTH)
      .toString()
      .padStart(OTP_LENGTH, "0");

    // Store hashed code
    const hashedCode = await argon2.hash(code);
    await PasswordResetToken.create({
      userId: user._id,
      email: user.email,
      code: hashedCode,
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
    });

    // Send email
    const firstName =
      (user.name as unknown as { firstName: string })?.firstName ?? "User";
    await emailService.sendPasswordResetCode(user.email, code, firstName);

    logger.info("Forgot password OTP sent", {
      userId: user._id.toString(),
    });
  },

  /**
   * Verifies the OTP code sent to the user's email.
   * Returns a short-lived reset token (the document _id) on success.
   */
  async verifyResetCode(
    email: string,
    code: string,
  ): Promise<{ resetToken: string }> {
    const record = await PasswordResetToken.findOne({
      email: email.toLowerCase().trim(),
    });

    if (!record) {
      throw AppError.badRequest("No password reset request found for this email");
    }

    if (record.expiresAt < new Date()) {
      await PasswordResetToken.deleteOne({ _id: record._id });
      throw AppError.badRequest("Verification code has expired. Please request a new one.");
    }

    if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
      await PasswordResetToken.deleteOne({ _id: record._id });
      throw AppError.badRequest(
        "Too many failed attempts. Please request a new code.",
      );
    }

    const isValid = await argon2.verify(record.code, code);
    if (!isValid) {
      record.attempts += 1;
      await record.save();
      throw AppError.badRequest("Invalid verification code");
    }

    // Mark as verified
    record.verified = true;
    await record.save();

    logger.info("Password reset code verified", { email });

    return { resetToken: record._id!.toString() };
  },

  /**
   * Resets the user's password after successful OTP verification.
   */
  async resetPassword(
    email: string,
    resetToken: string,
    newPassword: string,
  ): Promise<void> {
    const record = await PasswordResetToken.findById(resetToken);

    if (
      !record ||
      record.email !== email.toLowerCase().trim() ||
      !record.verified
    ) {
      throw AppError.badRequest(
        "Invalid or expired reset token. Please restart the password reset process.",
      );
    }

    if (record.expiresAt < new Date()) {
      await PasswordResetToken.deleteOne({ _id: record._id });
      throw AppError.badRequest("Reset token has expired. Please request a new code.");
    }

    const user = await User.findById(record.userId);
    if (!user) {
      throw AppError.notFound("User not found");
    }

    user.password = newPassword;
    await user.save();

    // Clean up all tokens for this user
    await PasswordResetToken.deleteMany({ userId: user._id });

    logger.info("Password reset successful", {
      userId: user._id.toString(),
    });
  },
};
