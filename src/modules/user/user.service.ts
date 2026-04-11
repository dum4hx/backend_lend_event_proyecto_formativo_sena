import { Types, type ClientSession } from "mongoose";
import { User, type UserInput } from "./models/user.model.ts";
import { AppError } from "../../errors/AppError.ts";
import { organizationService } from "../organization/organization.service.ts";
import { logger } from "../../utils/logger.ts";
import rolesService from "../roles/roles.service.ts";
import { LocationService } from "../location/location.service.ts";
import crypto from "crypto";

const OWNER_ROLE_NAME_VARIANTS = new Set(["propietario", "owner"]);
const LOCATION_MANAGER_ROLE_NAME_VARIANTS = new Set([
  "gerente",
  "gerente de sede",
  "manager",
  "branch manager",
  "propietario",
  "owner",
]);

function isOwnerRoleName(roleName?: string | null): boolean {
  if (!roleName) return false;
  return OWNER_ROLE_NAME_VARIANTS.has(roleName.trim().toLowerCase());
}

function isLocationManagerRoleName(roleName?: string | null): boolean {
  if (!roleName) return false;
  return LOCATION_MANAGER_ROLE_NAME_VARIANTS.has(roleName.trim().toLowerCase());
}

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
      throw AppError.notFound("Usuario no encontrado");
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
      roleId?: string;
      search?: string;
    } = {},
  ): Promise<{
    users: InstanceType<typeof User>[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20, status, roleId, search } = options;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = { organizationId };

    if (status) {
      query.status = status;
    }

    if (roleId) {
      query.roleId = roleId;
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

    // Map each user to include roleName instead of roleId
    const usersWithRoleNames = await Promise.all(
      users.map(async (user) => {
        const roleName = await rolesService.getRoleName(user.roleId);
        const userObj = user.toObject();
        return {
          ...userObj,
          roleName,
        };
      }),
    );

    return {
      users: usersWithRoleNames as any,
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
    const existingUser = await User.findOne({ _id: userId, organizationId });

    if (!existingUser) {
      throw AppError.notFound("Usuario no encontrado");
    }

    if (data.roleId && data.roleId !== existingUser.roleId) {
      const [currentRoleName, nextRoleName, managedLocationsCount] =
        await Promise.all([
          rolesService.getRoleName(existingUser.roleId),
          rolesService.getRoleName(data.roleId),
          LocationService.countLocationsByManager(
            existingUser._id,
            organizationId,
          ),
        ]);

      if (
        managedLocationsCount > 0 &&
        isLocationManagerRoleName(currentRoleName) &&
        !isLocationManagerRoleName(nextRoleName)
      ) {
        throw AppError.conflict(
          "No se puede cambiar el rol porque el usuario aún tiene sedes asignadas como gerente. Reasigna primero sus sedes",
          {
            code: "LOCATION_MANAGER_ROLE_CHANGE_BLOCKED",
            managedLocationsCount,
          },
        );
      }
    }

    if (data.locations !== undefined || data.roleId !== undefined) {
      const resolvedLocations =
        data.locations ??
        (existingUser.locations ?? []).map((loc) => loc.toString());
      const resolvedRoleId = data.roleId ?? existingUser.roleId;

      await rolesService.assertLocationsAllowedForRole(
        organizationId,
        resolvedRoleId,
        resolvedLocations,
      );
      await organizationService.validateLocationIds(
        organizationId,
        resolvedLocations,
      );
    }

    Object.assign(existingUser, data);
    const user = await existingUser.save();

    if (!user) {
      throw AppError.notFound("Usuario no encontrado");
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
    newRoleId: string,
    requestingUserId: Types.ObjectId | string,
  ): Promise<InstanceType<typeof User>> {
    const user = await User.findOne({ _id: userId, organizationId });
    if (!user) {
      throw AppError.notFound("Usuario no encontrado");
    }

    // Cannot change own role
    if (userId.toString() === requestingUserId.toString()) {
      throw AppError.badRequest("No puedes cambiar tu propio rol");
    }

    // Cannot demote the owner
    if (isOwnerRoleName(await user.getRoleName())) {
      throw AppError.badRequest(
        "No se puede cambiar el rol del propietario de la organización",
      );
    }

    // Cannot promote a role that does not belong to current organization
    const org = await organizationService.findById(organizationId);
    const orgRoles = await org.getOrgRoles();
    if (!orgRoles.some((role) => role._id.toString() === newRoleId)) {
      throw AppError.badRequest(
        "roleId inválido: El rol no pertenece a la organización",
      );
    }

    // Cannot promote to owner
    const newRoleName = orgRoles.find(
      (role) => role._id.toString() === newRoleId,
    )?.name;
    if (isOwnerRoleName(newRoleName)) {
      throw AppError.badRequest(
        "No se puede promover a un usuario al rol de propietario",
      );
    }

    const currentLocationIds = (user.locations ?? []).map((loc) =>
      loc.toString(),
    );
    await rolesService.assertLocationsAllowedForRole(
      organizationId,
      newRoleId,
      currentLocationIds,
    );

    const [currentRoleName, managedLocationsCount] = await Promise.all([
      rolesService.getRoleName(user.roleId),
      LocationService.countLocationsByManager(user._id, organizationId),
    ]);

    if (
      managedLocationsCount > 0 &&
      isLocationManagerRoleName(currentRoleName) &&
      !isLocationManagerRoleName(newRoleName)
    ) {
      throw AppError.conflict(
        "No se puede cambiar el rol porque el usuario aún tiene sedes asignadas como gerente. Reasigna primero sus sedes",
        {
          code: "LOCATION_MANAGER_ROLE_CHANGE_BLOCKED",
          managedLocationsCount,
        },
      );
    }

    user.roleId = newRoleId;
    await user.save();

    logger.info("User role updated", {
      userId: userId.toString(),
      newRoleId,
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
      throw AppError.notFound("Usuario no encontrado");
    }

    // Cannot deactivate self
    if (userId.toString() === requestingUserId.toString()) {
      throw AppError.badRequest("No puedes desactivar tu propia cuenta");
    }

    // Cannot deactivate owner
    if (isOwnerRoleName(await user.getRoleName())) {
      throw AppError.badRequest(
        "No se puede desactivar al propietario de la organización",
      );
    }

    const managedLocationsCount = await LocationService.countLocationsByManager(
      user._id,
      organizationId,
    );

    if (managedLocationsCount > 0) {
      throw AppError.conflict(
        "No se puede desactivar al usuario porque aún tiene sedes asignadas como gerente. Reasigna primero sus sedes",
        {
          code: "LOCATION_MANAGER_DEACTIVATION_BLOCKED",
          managedLocationsCount,
        },
      );
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
        "Límite de puestos alcanzado. Por favor mejora tu plan.",
        { code: "PLAN_LIMIT_REACHED" },
      );
    }

    const user = await User.findOneAndUpdate(
      { _id: userId, organizationId, status: "inactive" },
      { $set: { status: "active" } },
    );

    if (!user) {
      throw AppError.notFound("Usuario no encontrado o no está inactivo");
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
      throw AppError.notFound("Usuario no encontrado");
    }

    // Cannot delete self
    if (userId.toString() === requestingUserId.toString()) {
      throw AppError.badRequest("No puedes eliminar tu propia cuenta");
    }

    // Cannot delete owner
    if (isOwnerRoleName(await user.getRoleName())) {
      throw AppError.badRequest(
        "No se puede eliminar al propietario de la organización",
      );
    }

    const managedLocationsCount = await LocationService.countLocationsByManager(
      user._id,
      organizationId,
    );

    if (managedLocationsCount > 0) {
      throw AppError.conflict(
        "No se puede eliminar al usuario porque aún tiene sedes asignadas como gerente. Reasigna primero sus sedes",
        {
          code: "LOCATION_MANAGER_DELETE_BLOCKED",
          managedLocationsCount,
        },
      );
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
  ): Promise<{ user: InstanceType<typeof User>; permissions: string[] }> {
    const user = await User.findById(userId).populate(
      "organizationId",
      "name legalName subscription.plan status",
    );

    if (!user) {
      throw AppError.notFound("Usuario no encontrado");
    }

    // Since organizationId is populated, it's an object. We need the ID string.
    const orgId =
      user.organizationId instanceof Types.ObjectId
        ? user.organizationId.toString()
        : (user.organizationId as any)._id.toString();

    const permissions = await rolesService.getRolePermissions(
      user.roleId,
      orgId,
    );

    return { user, permissions };
  },

  /**
   * Generates a new password
   */
  async generateNewPassword(): Promise<string> {
    const newPassword = crypto.randomBytes(32).toString("hex");
    return newPassword;
  },
};
