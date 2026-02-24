import { Types, startSession } from "mongoose";
import { Role } from "./models/role.model.ts";
import { AppError } from "../../errors/AppError.ts";

export const rolesService = {
  async create(roleData: {
    organizationId: Types.ObjectId | string;
    name: string;
    permissions?: string[];
    description?: string;
  }) {
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
    const session = await startSession();
    return await session.withTransaction(async () => {
      const role = await Role.findOne({ _id: id, organizationId }).session(
        session,
      );
      if (!role) {
        throw AppError.notFound("Role not found");
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
          throw AppError.conflict("Role with that name already exists");
        }
        throw err;
      }
    });
  },

  async delete(id: string, organizationId: Types.ObjectId | string) {
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
};

export default rolesService;
