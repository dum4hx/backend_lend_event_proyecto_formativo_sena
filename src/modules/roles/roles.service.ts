import { Types, startSession } from "mongoose";
import { createRequire } from "node:module";
import type { Request } from "express";
import { getOrgId } from "../../middleware/auth.ts";
import { Role } from "./models/role.model.ts";
import { AppError } from "../../errors/AppError.ts";
import { super_admin_only_permsissions } from "./models/role.model.ts";

const OWNER_ROLE_NAME_VARIANTS = new Set(["propietario", "owner"]);

function isOwnerRoleName(roleName?: string | null): boolean {
  if (!roleName) return false;
  return OWNER_ROLE_NAME_VARIANTS.has(roleName.trim().toLowerCase());
}

/* ---------- Permission dependency map ---------- */

const require = createRequire(import.meta.url);
const permissionsJson: Array<{
  _id: string;
  requires?: string[];
}> = require("./seeders/permissions.json");

/** Map from permission id → list of required permissions. */
const PERMISSION_REQUIRES = new Map<string, string[]>(
  permissionsJson
    .filter((p) => p.requires && p.requires.length > 0)
    .map((p) => [p._id, p.requires!]),
);

/* ---------- Shared Validation ---------- */

/** Set of permissions exclusive to the platform super-admin role. */
const SUPER_ADMIN_PERMISSIONS = new Set<string>(super_admin_only_permsissions);

/**
 * Reusable guard that rejects any attempt to use the `super_admin` role
 * name **or** any platform-only permission inside an organization role.
 *
 * Call this before persisting a role in `create` / `update` flows.
 *
 * @throws {AppError} 400 when the role name or any permission is restricted.
 */
function assertNotSuperAdmin(data: {
  name?: string;
  permissions?: string[];
}): void {
  if (data.name === "super_admin") {
    throw AppError.badRequest(
      "El rol 'super_admin' es exclusivo de la plataforma y no puede asignarse a una organización",
    );
  }

  if (data.permissions?.length) {
    const forbidden = data.permissions.filter((p) =>
      SUPER_ADMIN_PERMISSIONS.has(p),
    );
    if (forbidden.length > 0) {
      throw AppError.badRequest(
        `Los siguientes permisos están restringidos al super-administrador de la plataforma y no pueden ser utilizados: ${forbidden.join(", ")}`,
      );
    }
  }
}

/**
 * Guard that blocks any mutation or deletion of a read-only (system) role.
 *
 * The `owner` role is seeded as `isReadOnly: true` during organization
 * registration, ensuring every organization always retains its owner role.
 * This guard must be called **after** the role document is fetched from the DB.
 *
 * @throws {AppError} 403 when the role has `isReadOnly: true`.
 */
function assertNotReadOnly(role: {
  isReadOnly?: boolean;
  name?: string;
}): void {
  if (role.isReadOnly) {
    throw AppError.forbidden(
      `El rol '${
        role.name ?? "owner"
      }' es un rol del sistema y no puede ser modificado o eliminado`,
    );
  }
}

/**
 * Validates that every permission in the list has all its required
 * dependencies also present. Throws `AppError.badRequest` when
 * one or more dependencies are missing.
 */
function assertPermissionDependencies(permissions: string[]): void {
  const permSet = new Set(permissions);
  const issues: string[] = [];

  for (const perm of permissions) {
    const deps = PERMISSION_REQUIRES.get(perm);
    if (!deps) continue;
    const missing = deps.filter((d) => !permSet.has(d));
    if (missing.length > 0) {
      issues.push(
        `El permiso '${perm}' requiere los siguientes permisos que no están incluidos: ${missing.join(", ")}`,
      );
    }
  }

  if (issues.length > 0) {
    throw AppError.badRequest(
      `Dependencias de permisos incompletas:\n- ${issues.join("\n- ")}`,
    );
  }
}

/* ---------- Roles Service ---------- */
/**
 * Business logic for roles management.
 *
 * Responsibilities:
 * - perform database operations and transactions for role entities
 * - enforce per-organization uniqueness and raise domain errors
 * - provide request-aware wrapper methods so routers remain thin
 */

export const rolesService = {
  async create(roleData: {
    organizationId: Types.ObjectId | string;
    name: string;
    permissions?: string[];
    description?: string;
  }) {
    assertNotSuperAdmin(roleData);
    if (roleData.permissions?.length) {
      assertPermissionDependencies(roleData.permissions);
    }

    const session = await startSession();
    return await session.withTransaction(async () => {
      const roleDoc = new Role({
        ...roleData,
      });

      try {
        const created = await roleDoc.save({ session });
        return created;
      } catch (err: unknown) {
        // Handle duplicate key (unique per-organization)
        if ((err as any)?.code === 11000) {
          throw AppError.conflict("Ya existe un rol con ese nombre");
        }
        throw err;
      }
    });
  },

  async listByOrganization(
    organizationId: Types.ObjectId | string,
    query: {
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: "asc" | "desc";
    } = {},
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sort: Record<string, 1 | -1> = {};
    if (query.sortBy) {
      sort[query.sortBy] = query.sortOrder === "asc" ? 1 : -1;
    } else {
      sort["createdAt"] = -1;
    }

    const filter = { organizationId } as any;

    const [items, total] = await Promise.all([
      Role.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Role.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page,
      limit,
    };
  },

  async findById(id: string, organizationId: Types.ObjectId | string) {
    /**
     * Find a role by id within the provided organization.
     * Throws `AppError.notFound` if not present.
     */
    const role = await Role.findOne({ _id: id, organizationId });
    if (!role) {
      throw AppError.notFound("Rol no encontrado");
    }
    return role;
  },

  async update(
    id: string,
    organizationId: Types.ObjectId | string,
    updateData: { permissions?: string[]; description?: string; name?: string },
  ) {
    /**
     * Update a role document within a transaction. Validates existence
     * and translates duplicate-key errors to domain conflicts.
     */
    const session = await startSession();
    return await session.withTransaction(async () => {
      const role = await Role.findOne({ _id: id, organizationId }).session(
        session,
      );
      if (!role) {
        throw AppError.notFound("Rol no encontrado");
      }

      // Prevent modifying system roles (e.g. owner) and super_admin names/perms
      assertNotReadOnly(role);
      assertNotSuperAdmin(updateData);
      if (updateData.permissions?.length) {
        assertPermissionDependencies(updateData.permissions);
      }

      if (updateData.name !== undefined) role.name = updateData.name;
      if (updateData.permissions !== undefined)
        role.permissions = updateData.permissions;
      if (updateData.description !== undefined)
        role.description = updateData.description;

      try {
        await role.save({ session });
        return role;
      } catch (err: unknown) {
        if ((err as any)?.code === 11000) {
          throw AppError.conflict("Ya existe un rol con ese nombre");
        }
        throw err;
      }
    });
  },

  async delete(id: string, organizationId: Types.ObjectId | string) {
    /**
     * Delete a role by id for the provided organization. Runs inside a
     * transaction to keep behavior consistent with other mutating ops.
     */
    const session = await startSession();
    return await session.withTransaction(async () => {
      const role = await Role.findOne({ _id: id, organizationId }).session(
        session,
      );
      if (!role) {
        throw AppError.notFound("Rol no encontrado");
      }

      // Prevent deleting system roles (e.g. owner) — every organization
      // must retain at least one owner role at all times.
      assertNotReadOnly(role);

      await Role.deleteOne({ _id: id, organizationId }).session(session);
      return true;
    });
  },

  async listFromRequest(req: Request) {
    /* ---------- Request-aware wrappers ---------- */
    /**
     * Convenience wrapper: extract organization id and query params
     * from the express `Request` and delegate to `listByOrganization`.
     */
    const orgId = getOrgId(req);
    return await rolesService.listByOrganization(orgId, req.query as any);
  },

  async findByIdFromRequest(req: Request) {
    /**
     * Convenience wrapper to find a role using values from the request
     * (route params + organization id).
     */
    const orgId = getOrgId(req);
    return await rolesService.findById(req.params.id as string, orgId);
  },

  async createFromRequest(req: Request) {
    /**
     * Convenience wrapper to create a role using `req.body` and the
     * organization id extracted from the request.
     */
    const orgId = getOrgId(req);
    return await rolesService.create({ organizationId: orgId, ...req.body });
  },

  async updateFromRequest(req: Request) {
    /**
     * Convenience wrapper to update a role using `req.params.id`, the
     * organization id and the body payload.
     */
    const orgId = getOrgId(req);
    return await rolesService.update(req.params.id as string, orgId, req.body);
  },

  async deleteFromRequest(req: Request) {
    /**
     * Convenience wrapper to delete a role identified in the request.
     */
    const orgId = getOrgId(req);
    return await rolesService.delete(req.params.id as string, orgId);
  },

  async getRolePermissions(
    roleId: string,
    organizationId: Types.ObjectId | string,
  ) {
    /**
     * Retrieve the permissions for a given role within an organization.
     */
    const role = await Role.findOne({
      _id: roleId,
      organizationId: organizationId,
    });
    if (!role) {
      throw AppError.notFound("Rol no encontrado");
    }
    return role.permissions;
  },

  /**
   * Retrieve the name for a given role id. Used to embed human-readable
   * role names in JWTs at token-mint time, avoiding a DB round-trip on
   * every authenticated request.
   */
  async getRoleName(roleId: string) {
    const role = await Role.findById(roleId).select("name");
    if (!role) {
      throw AppError.notFound("Rol no encontrado");
    }
    return role.name;
  },

  /**
   * Validates whether the provided locations are compatible with the role.
   * Only owner roles can be assigned to multiple locations.
   */
  async assertLocationsAllowedForRole(
    organizationId: Types.ObjectId | string,
    roleId: string,
    locationIds: string[],
  ): Promise<void> {
    if (!locationIds || locationIds.length === 0) {
      throw AppError.badRequest("Se debe asignar al menos una ubicación");
    }

    const role = await Role.findOne({ _id: roleId, organizationId })
      .select("name")
      .lean();

    if (!role) {
      throw AppError.badRequest(
        "roleId inválido: El rol no pertenece a la organización",
      );
    }

    const allowsMultipleLocations = isOwnerRoleName(role.name);
    if (!allowsMultipleLocations && locationIds.length > 1) {
      throw AppError.badRequest(
        "Solo el rol de Dueño puede tener múltiples ubicaciones",
      );
    }
  },
};

export default rolesService;
