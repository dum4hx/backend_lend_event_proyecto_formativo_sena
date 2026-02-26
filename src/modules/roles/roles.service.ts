import { Types, startSession } from "mongoose";
import type { Request } from "express";
import { getOrgId } from "../../middleware/auth.ts";
import { Role } from "./models/role.model.ts";
import { AppError } from "../../errors/AppError.ts";
import { super_admin_permsissions } from "../user/models/user.model.ts";

/* ---------- Shared Validation ---------- */

/** Set of permissions exclusive to the platform super-admin role. */
const SUPER_ADMIN_PERMISSIONS = new Set<string>(super_admin_permsissions);

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
      "The 'super_admin' role is platform-only and cannot be assigned to an organization",
    );
  }

  if (data.permissions?.length) {
    const forbidden = data.permissions.filter((p) =>
      SUPER_ADMIN_PERMISSIONS.has(p),
    );
    if (forbidden.length > 0) {
      throw AppError.badRequest(
        `The following permissions are restricted to the platform super-admin and cannot be used: ${forbidden.join(", ")}`,
      );
    }
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
          throw AppError.conflict("Role with that name already exists");
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
      throw AppError.notFound("Role not found");
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
        throw AppError.notFound("Role not found");
      }

      assertNotSuperAdmin(updateData);

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
          throw AppError.conflict("Role with that name already exists");
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
        throw AppError.notFound("Role not found");
      }

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
};

export default rolesService;
