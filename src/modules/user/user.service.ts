import type { Types, ClientSession } from "mongoose";
import { User, type UserInput, type UserRole } from "./models/user.model.ts";
import { AppError } from "../../errors/AppError.ts";
import { organizationService } from "../organization/organization.service.ts";
import { logger } from "../../utils/logger.ts";

/* ---------- User Service ---------- */

export const userService = {
  /**
   * Finds a user by ID within an organization scope.
   */
  async findById(
    userId: Types.ObjectId | string,
    organizationId: Types.ObjectId | string,
  ): Promise<InstanceType<typeof User>> {
    const user = await User.findOne({
      _id: userId,
      organizationId,
    });

    if (!user) {
      throw AppError.notFound("User not found");
    }

    return user;
  },

  /**
   * Finds a user by email within an organization scope.
   */
  async findByEmail(
    email: string,
    organizationId: Types.ObjectId | string,
  ): Promise<InstanceType<typeof User> | null> {
    return User.findOne({
      email: email.toLowerCase(),
      organizationId,
    });
  },

  /**
   * Lists all users in an organization with pagination.
   */
  async listByOrganization(
    organizationId: Types.ObjectId | string,
    options: {
      page?: number;
      limit?: number;
      status?: string;
      role?: UserRole;
      search?: string;
    } = {},
  ): Promise<{
    users: InstanceType<typeof User>[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20, status, role, search } = options;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = { organizationId };

    if (status) {
      query.status = status;
    }

    if (role) {
      query.role = role;
    }

    if (search) {
      query.$or = [
        { email: { $regex: search, $options: "i" } },
        { "name.firstName": { $regex: search, $options: "i" } },
        { "name.firstSurname": { $regex: search, $options: "i" } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query).skip(skip).limit(limit).sort({ createdAt: -1 }),
      User.countDocuments(query),
    ]);

    return {
      users,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Updates a user's profile.
   */
  async update(
    userId: Types.ObjectId | string,
    organizationId: Types.ObjectId | string,
    data: Partial<Omit<UserInput, "organizationId" | "password">>,
  ): Promise<InstanceType<typeof User>> {
    const user = await User.findOneAndUpdate(
      { _id: userId, organizationId },
      { $set: data },
      { new: true, runValidators: true },
    );

    if (!user) {
      throw AppError.notFound("User not found");
    }

    logger.info("User updated", { userId: userId.toString() });

    return user;
  },

  /**
   * Updates a user's role.
   * Only organization owners can change roles.
   */
  async updateRole(
    userId: Types.ObjectId | string,
    organizationId: Types.ObjectId | string,
    newRole: UserRole,
    requestingUserId: Types.ObjectId | string,
  ): Promise<InstanceType<typeof User>> {
    const user = await User.findOne({ _id: userId, organizationId });
    if (!user) {
      throw AppError.notFound("User not found");
    }

    // Cannot change own role
    if (userId.toString() === requestingUserId.toString()) {
      throw AppError.badRequest("You cannot change your own role");
    }

    // Cannot demote the owner
    if (user.role === "owner") {
      throw AppError.badRequest(
        "Cannot change the role of the organization owner",
      );
    }

    // Cannot promote to owner
    if (newRole === "owner") {
      throw AppError.badRequest("Cannot promote user to owner role");
    }

    user.role = newRole;
    await user.save();

    logger.info("User role updated", {
      userId: userId.toString(),
      newRole,
      updatedBy: requestingUserId.toString(),
    });

    return user;
  },

  /**
   * Deactivates a user account.
   */
  async deactivate(
    userId: Types.ObjectId | string,
    organizationId: Types.ObjectId | string,
    requestingUserId: Types.ObjectId | string,
  ): Promise<void> {
    const user = await User.findOne({ _id: userId, organizationId });
    if (!user) {
      throw AppError.notFound("User not found");
    }

    // Cannot deactivate self
    if (userId.toString() === requestingUserId.toString()) {
      throw AppError.badRequest("You cannot deactivate your own account");
    }

    // Cannot deactivate owner
    if (user.role === "owner") {
      throw AppError.badRequest("Cannot deactivate the organization owner");
    }

    user.status = "inactive";
    await user.save();

    // Update seat count
    const org = await organizationService.findById(organizationId);
    const currentSeats = org.subscription?.seatCount ?? 1;
    if (currentSeats > 1) {
      await organizationService.updateSeatCount(
        organizationId,
        currentSeats - 1,
      );
    }

    logger.info("User deactivated", {
      userId: userId.toString(),
      deactivatedBy: requestingUserId.toString(),
    });
  },

  /**
   * Reactivates a user account.
   */
  async reactivate(
    userId: Types.ObjectId | string,
    organizationId: Types.ObjectId | string,
  ): Promise<void> {
    // Check if organization can add seats
    const canAddSeat = await organizationService.canAddSeat(organizationId);
    if (!canAddSeat) {
      throw AppError.badRequest(
        "Seat limit reached. Please upgrade your plan.",
        { code: "PLAN_LIMIT_REACHED" },
      );
    }

    const user = await User.findOneAndUpdate(
      { _id: userId, organizationId, status: "inactive" },
      { $set: { status: "active" } },
    );

    if (!user) {
      throw AppError.notFound("User not found or not inactive");
    }

    // Update seat count
    const org = await organizationService.findById(organizationId);
    const currentSeats = org.subscription?.seatCount ?? 1;
    await organizationService.updateSeatCount(organizationId, currentSeats + 1);

    logger.info("User reactivated", { userId: userId.toString() });
  },

  /**
   * Deletes a user permanently.
   * Use with caution - prefer deactivation.
   */
  async delete(
    userId: Types.ObjectId | string,
    organizationId: Types.ObjectId | string,
    requestingUserId: Types.ObjectId | string,
  ): Promise<void> {
    const user = await User.findOne({ _id: userId, organizationId });
    if (!user) {
      throw AppError.notFound("User not found");
    }

    // Cannot delete self
    if (userId.toString() === requestingUserId.toString()) {
      throw AppError.badRequest("You cannot delete your own account");
    }

    // Cannot delete owner
    if (user.role === "owner") {
      throw AppError.badRequest("Cannot delete the organization owner");
    }

    await User.deleteOne({ _id: userId });

    // Update seat count if user was active
    if (user.status === "active") {
      const org = await organizationService.findById(organizationId);
      const currentSeats = org.subscription?.seatCount ?? 1;
      if (currentSeats > 1) {
        await organizationService.updateSeatCount(
          organizationId,
          currentSeats - 1,
        );
      }
    }

    logger.info("User deleted", {
      userId: userId.toString(),
      deletedBy: requestingUserId.toString(),
    });
  },

  /**
   * Gets the current user's profile with organization info.
   */
  async getProfile(
    userId: Types.ObjectId | string,
  ): Promise<InstanceType<typeof User>> {
    const user = await User.findById(userId).populate(
      "organizationId",
      "name legalName subscription.plan status",
    );

    if (!user) {
      throw AppError.notFound("User not found");
    }

    return user;
  },
};
