import type { Types } from "mongoose";
import { Category } from "./models/category.model.ts";
import { MaterialModel } from "./models/material_type.model.ts";
import { AppError } from "../../errors/AppError.ts";
import { logger } from "../../utils/logger.ts";

/* ---------- Material Service ---------- */

export const materialService = {
  /**
   * Deletes a material category within an organization.
   * Fails if any material types reference this category.
   */
  async deleteCategory(
    organizationId: Types.ObjectId | string,
    categoryId: Types.ObjectId | string,
  ): Promise<void> {
    const category = await Category.findOne({ _id: categoryId, organizationId });
    if (!category) {
      throw AppError.notFound("Category not found");
    }

    // If any material types reference this category, prevent deletion
    const linkedCount = await MaterialModel.countDocuments({
      organizationId,
      categoryId,
    });

    if (linkedCount > 0) {
      throw AppError.badRequest(
        "Cannot delete category while material types exist",
        { code: "CATEGORY_HAS_MATERIALS" },
      );
    }

    await Category.deleteOne({ _id: categoryId });

    logger.info("Material category deleted", {
      categoryId: categoryId.toString(),
      organizationId: organizationId.toString(),
    });
  },
};
