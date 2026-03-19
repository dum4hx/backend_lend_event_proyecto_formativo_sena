import * as argon2 from "argon2";
import { Types, startSession } from "mongoose";
import crypto from "node:crypto";
import { User, type UserInput } from "../user/models/user.model.ts";
import {
  defaultOrganizationRoleDefs,
  OWNER_ROLE_NAME,
  Role,
  rolePermissions,
  type UserRole,
} from "../roles/models/role.model.ts";
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
import { EmailVerificationToken } from "./models/email_verification_token.model.ts";
import { emailService } from "../../utils/email.ts";
import { logger } from "../../utils/logger.ts";
import roleService from "../roles/roles.service.ts";
import { userService } from "../user/user.service.ts";

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const MAX_VERIFY_ATTEMPTS = 5;
const EMAIL_VERIFY_EXPIRY_MINUTES = 5;
const MAX_EMAIL_VERIFY_ATTEMPTS = 5;
const INVITE_EXPIRY_HOURS = parseInt(
  process.env.INVITE_EXPIRY_HOURS || "48",
  10,
);
const FRONTEND_URL = process.env.FRONTEND_URL || "https://app.test.local";

/* ---------- Internal Helpers ---------- */

async function cleanupPendingRegistration(
  userId: Types.ObjectId,
  organizationId: Types.ObjectId | string,
): Promise<void> {
  const userCount = await User.countDocuments({ organizationId });
  if (userCount <= 1) {
    await Organization.deleteOne({ _id: organizationId });
    await Role.deleteMany({ organizationId });
  }
  await User.deleteOne({ _id: userId });
  await EmailVerificationToken.deleteMany({ userId });
}

/* ---------- Auth Service ---------- */

export const authService = {
  /**
   * Checks if the user has super-admin permissions.
   */
  async isSuperAdmin(userId: Types.ObjectId | string): Promise<boolean> {
    const { userService } = await import("../user/user.service.ts");
    const profile = await userService.getProfile(userId);

    const userRolePermissions = await roleService.getRolePermissions(
      profile.user.roleId,
      profile.user.organizationId,
    );

    // Compare whether the user has super admin permissions (at which case they should not be considered an owner)
    const superAdminRolePermsSet = new Set(rolePermissions.super_admin);
    const isSuperAdmin = userRolePermissions.every((perm) =>
      superAdminRolePermsSet.has(perm),
    );

    return isSuperAdmin;
  },

  /**
   * Checks whether the user is an owner (based on permissions).
   */
  async isOwner(userId: Types.ObjectId | string): Promise<boolean> {
    const { userService } = await import("../user/user.service.ts");
    const profile = await userService.getProfile(userId);

    const userRolePermissions = await roleService.getRolePermissions(
      profile.user.roleId,
      profile.user.organizationId,
    );

    // Compare whether the user has all the permissions of the owner role
    const ownerRolePermsSet = new Set(rolePermissions.owner);
    const hasOwnerPermissions = userRolePermissions.every((perm) =>
      ownerRolePermsSet.has(perm),
    );

    // If user has super admin permissions, they are not considered an owner for org-level checks
    const isSuperAdmin = await authService.isSuperAdmin(userId);

    return hasOwnerPermissions && !isSuperAdmin;
  },

  /**
   * Registers a new organization with an owner account.
   * Creates both organization and owner user in a transaction.
   */
  async register(
    organizationData: Omit<OrganizationInput, "ownerId">,
    ownerData: Omit<UserInput, "organizationId" | "roleId">,
  ): Promise<{
    organization: InstanceType<typeof Organization>;
    user: InstanceType<typeof User>;
  }> {
    const session = await startSession();

    // Captured outside the transaction for use after commit
    let createdOrg: InstanceType<typeof Organization> = undefined as any;
    let createdUser: InstanceType<typeof User> = undefined as any;

    await session.withTransaction(async () => {
      // Check if email already exists for user
      const existingUser = await User.findOne({
        email: ownerData.email.trim().toLowerCase(),
      }).session(session);
      if (existingUser) {
        if (existingUser.status === "pending_email_verification") {
          throw AppError.conflict(
            "A registration with this email is already pending email verification. Please check your inbox or wait 5 minutes to try again.",
            { code: "PENDING_EMAIL_VERIFICATION" },
          );
        }
        throw AppError.conflict("A user with this email already exists", {
          code: "USER_EMAIL_ALREADY_EXISTS",
        });
      }

      // Check if taxId is provided and already exists for another organization
      const taxId = organizationData.taxId?.trim();
      if (taxId) {
        const existingOrgWithTaxId = await Organization.findOne({
          taxId,
        }).session(session);
        if (existingOrgWithTaxId) {
          throw AppError.conflict(
            "An organization with this tax ID already exists",
            {
              code: "TAX_ID_ALREADY_EXISTS",
            },
          );
        }
      }

      // Check if email already exists for organization
      const existingOrgWithEmail = await Organization.findOne({
        email: organizationData.email.trim().toLowerCase(),
      }).session(session);
      if (existingOrgWithEmail) {
        throw AppError.conflict(
          "An organization with this email already exists",
          {
            code: "ORG_EMAIL_ALREADY_EXISTS",
          },
        );
      }

      // Check if user phone already exists
      const existingUserWithPhone = await User.findOne({
        phone: ownerData.phone.trim(),
      }).session(session);
      if (existingUserWithPhone) {
        throw AppError.conflict(
          "A user with this phone number already exists",
          {
            code: "USER_PHONE_ALREADY_EXISTS",
          },
        );
      }

      // Check if organization phone already exists
      const existingOrgWithPhone = await Organization.findOne({
        phone: organizationData.phone?.trim() ?? "",
      }).session(session);

      if (existingOrgWithPhone) {
        throw AppError.conflict(
          "An organization with this phone number already exists",
          { code: "ORG_PHONE_ALREADY_EXISTS" },
        );
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
        const defaultPlan = await SubscriptionType.findOne({
          plan: "starter",
          status: "active",
        }).session(session);
        if (!defaultPlan) {
          throw AppError.badRequest(
            "Starter subscription plan not found or inactive",
          );
        }
        // Snapshot plan limits so org operations remain functional even if
        // the SubscriptionType record is later deleted or disabled.
        orgData.subscription = {
          plan: defaultPlan.plan,
          seatCount: 1,
          catalogItemCount: 0,
          maxSeats: defaultPlan.maxSeats,
          maxCatalogItems: defaultPlan.maxCatalogItems,
        };
      }

      const orgDoc = new Organization(orgData);
      const organization = await orgDoc.save({ session });

      // Seed all default organization roles first so the owner role _id is
      // available before the user document is created. insertMany returns the
      // inserted documents, letting us pluck the owner _id without a round-trip.
      const insertedRoles = await Role.insertMany(
        defaultOrganizationRoleDefs.map((def) => ({
          organizationId: organization._id,
          ...def, // name, permissions, isReadOnly, type, description
        })) as any[],
        { session },
      );

      const ownerRole = insertedRoles.find((r) => r.name === OWNER_ROLE_NAME);
      if (!ownerRole) {
        logger.error("Owner role not found after insert", {
          organizationId: organization._id.toString(),
        });
        throw AppError.internal("Failed to initialize owner role");
      }

      // Create the owner user with roleId already set — no second save needed.
      const user = await new User({
        _id: ownerId,
        ...ownerData,
        organizationId: organization._id,
        roleId: ownerRole._id.toString(),
        status: "pending_email_verification",
      }).save({ session });

      createdOrg = organization;
      createdUser = user;
    });

    await session.endSession();

    // Generate a 6-digit OTP for email verification
    const code =
      process.env.NODE_ENV === "test"
        ? "123456"
        : crypto
            .randomInt(0, 10 ** OTP_LENGTH)
            .toString()
            .padStart(OTP_LENGTH, "0");
    const hashedCode = await argon2.hash(code);

    await EmailVerificationToken.create({
      userId: createdUser._id,
      organizationId: createdOrg._id,
      email: createdUser.email,
      code: hashedCode,
      expiresAt: new Date(Date.now() + EMAIL_VERIFY_EXPIRY_MINUTES * 60 * 1000),
    });

    try {
      const firstName =
        (createdUser.name as unknown as { firstName: string })?.firstName ??
        "User";
      await emailService.sendEmailVerificationCode(
        createdUser.email,
        code,
        firstName,
      );
    } catch (emailErr) {
      await cleanupPendingRegistration(createdUser._id, createdOrg._id);
      logger.error("Failed to send verification email during registration", {
        userId: createdUser._id.toString(),
        error: emailErr,
      });
      throw AppError.internal(
        "Failed to send verification email. Please try again.",
      );
    }

    logger.info("Organization registered, awaiting email verification", {
      organizationId: createdOrg._id.toString(),
      ownerId: createdUser._id.toString(),
    });

    return { organization: createdOrg, user: createdUser };
  },

  /**
   * Verifies the email OTP sent during registration and activates the account.
   * Returns tokens and full profile data on success (same as the old register).
   */
  async verifyEmail(
    email: string,
    code: string,
  ): Promise<{
    organization: InstanceType<typeof Organization>;
    user: InstanceType<typeof User>;
    tokens: TokenPair;
    roleName: string;
    permissions: string[];
  }> {
    const normalizedEmail = email.toLowerCase().trim();

    const record = await EmailVerificationToken.findOne({
      email: normalizedEmail,
    });

    if (!record) {
      throw AppError.badRequest(
        "No pending email verification found for this address.",
      );
    }

    if (record.expiresAt < new Date()) {
      await cleanupPendingRegistration(
        record.userId as Types.ObjectId,
        record.organizationId as Types.ObjectId | string,
      );
      throw AppError.badRequest(
        "Verification code has expired. Your registration data has been removed. Please register again.",
      );
    }

    if (record.attempts >= MAX_EMAIL_VERIFY_ATTEMPTS) {
      await cleanupPendingRegistration(
        record.userId as Types.ObjectId,
        record.organizationId as Types.ObjectId | string,
      );
      throw AppError.badRequest(
        "Too many failed verification attempts. Please register again.",
      );
    }

    const isValid = await argon2.verify(record.code, code);
    if (!isValid) {
      record.attempts += 1;
      await record.save();
      const remaining = MAX_EMAIL_VERIFY_ATTEMPTS - record.attempts;
      throw AppError.badRequest(
        `Invalid verification code. ${remaining} attempt(s) remaining.`,
      );
    }

    // Activate the user
    const user = await User.findByIdAndUpdate(
      record.userId,
      { status: "active" },
      { new: true },
    );

    if (!user) {
      throw AppError.notFound("User account not found");
    }

    const organization = await Organization.findById(record.organizationId);
    if (!organization) {
      throw AppError.notFound("Organization not found");
    }

    // Clean up the verification token
    await EmailVerificationToken.deleteMany({ userId: record.userId });

    const roleName = await roleService.getRoleName(user.roleId);
    const permissions = await roleService.getRolePermissions(
      user.roleId,
      organization._id.toString(),
    );

    const tokens = await generateTokenPair({
      sub: user._id.toString(),
      org: organization._id.toString(),
      roleId: user.roleId,
      roleName,
      email: user.email,
    });

    logger.info("Email verified and account activated", {
      userId: user._id.toString(),
      organizationId: organization._id.toString(),
    });

    return { organization, user, tokens, roleName, permissions };
  },

  /**
   * Deletes all pending-registration documents (user, org, roles) whose
   * 5-minute verification window has elapsed. Called by the background job.
   */
  async purgeExpiredPendingRegistrations(): Promise<void> {
    const cutoffTime = new Date(
      Date.now() - EMAIL_VERIFY_EXPIRY_MINUTES * 60 * 1000,
    );

    const expiredUsers = await User.find({
      status: "pending_email_verification",
      createdAt: { $lt: cutoffTime },
    })
      .select("_id organizationId")
      .lean();

    if (expiredUsers.length === 0) return;

    for (const pendingUser of expiredUsers) {
      await cleanupPendingRegistration(
        pendingUser._id as Types.ObjectId,
        pendingUser.organizationId as Types.ObjectId | string,
      );
      logger.info("Purged expired pending registration", {
        userId: pendingUser._id.toString(),
      });
    }
  },

  /**
   * Authenticates a user with email and password.
   */
  async login(
    email: string,
    password: string,
  ): Promise<{
    user: InstanceType<typeof User>;
    tokens: TokenPair;
    roleName: string;
    permissions: string[];
  }> {
    // Find user with password field
    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .select("+password")
      .populate("organizationId", "status");

    if (!user) {
      throw AppError.unauthorized("Invalid email or password");
    }

    // Verify password
    const isValidPassword = await user.verifyPassword(password);
    if (!isValidPassword) {
      throw AppError.unauthorized("Invalid email or password");
    }

    // Check user status
    if (user.status === "pending_email_verification") {
      throw AppError.unauthorized(
        "Please verify your email address before logging in. Check your inbox for a verification code.",
        { code: "EMAIL_NOT_VERIFIED" },
      );
    }

    if (user.status === "suspended") {
      throw AppError.unauthorized("Your account has been suspended");
    }

    if (user.status === "inactive") {
      throw AppError.unauthorized("Your account is inactive");
    }

    // Check organization status
    const org = user.organizationId as unknown as {
      _id: Types.ObjectId;
      status: string;
    };
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
    const roleName = await roleService.getRoleName(user.roleId);
    const tokens = await generateTokenPair({
      sub: user._id.toString(),
      org: org._id.toString(),
      roleId: user.roleId,
      roleName: roleName,
      email: user.email,
    });

    // Get role permissions for logging (not included in token to save space)
    const permissions = await roleService.getRolePermissions(
      user.roleId,
      org._id.toString(),
    );
    logger.info("User logged in", { userId: user._id.toString() });

    // Remove password from response
    user.password = undefined as unknown as string;

    return { user, tokens, roleName, permissions };
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
      roleId: user.roleId,
      roleName: await roleService.getRoleName(user.roleId),
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
      email: userData.email.toLowerCase(),
    });

    if (existingUser) {
      throw AppError.conflict(
        "A user with this email already exists in this organization",
        { code: "USER_EMAIL_ALREADY_EXISTS" },
      );
    }

    // Validate location IDs are provided and belong to the organization
    if (userData.locations && userData.locations.length > 0) {
      await organizationService.validateLocationIds(
        organizationId,
        userData.locations,
      );
    } else {
      throw AppError.badRequest(
        "At least one location must be assigned to the user",
      );
    }

    // Generate a placeholder password (user will set their own via invite link)
    const placeholderPassword = await userService.generateNewPassword();

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

    if (process.env.NODE_ENV !== "test") {
      await emailService.sendInviteEmail(
        userData.email,
        userData.name.firstName,
        orgName,
        inviteUrl,
        INVITE_EXPIRY_HOURS,
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
   * Accepts an invite by validating the token and setting the user's password.
   */
  async acceptInvite(
    email: string,
    token: string,
    newPassword: string,
  ): Promise<InstanceType<typeof User>> {
    // Check if user has been invited (means there should be an invite token with their email)
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

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

    // Update user password and status
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

    const profile = await userService.getProfile(userId);

    // Check if user is owner
    const hasOwnerPermissions = await authService.isOwner(userId);

    if (!hasOwnerPermissions) {
      throw AppError.unauthorized(
        "Only organization owners can check payment status",
      );
    }

    // Allow login if user is super admin, regardless of org status
    const isSuperAdmin = await authService.isSuperAdmin(userId);
    if (isSuperAdmin) {
      response.isActive = true;
      return response;
    }

    // Get organization
    const organization = await Organization.findById(
      profile.user.organizationId,
    )
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
      !organization.subscription?.currentPeriodEnd ||
      organization.subscription.currentPeriodEnd < new Date()
    ) {
      await Organization.updateOne(
        { _id: profile.user.organizationId },
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
      throw AppError.badRequest(
        "No password reset request found for this email",
      );
    }

    if (record.expiresAt < new Date()) {
      await PasswordResetToken.deleteOne({ _id: record._id });
      throw AppError.badRequest(
        "Verification code has expired. Please request a new one.",
      );
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
      throw AppError.badRequest(
        "Reset token has expired. Please request a new code.",
      );
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
