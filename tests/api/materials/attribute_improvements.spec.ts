import { test, expect } from "@playwright/test";

const randomString = (length: number = 8) =>
  Math.random()
    .toString(36)
    .substring(2, length + 2);

test.describe.serial("Material Attribute Architecture Improvements", () => {
  let categoryId1: string;
  let categoryId2: string;
  let attributeId1: string;
  let attributeId2: string;

  test.describe("1. CategoryId Foreign Key Validation", () => {
    test("should reject attribute creation with invalid categoryId", async ({
      request,
    }) => {
      const invalidCategoryId = "507f1f77bcf86cd799439011";

      const response = await request.post("materials/attributes", {
        data: {
          name: `Test_Attr_${randomString(8)}`,
          categoryId: invalidCategoryId, // Invalid - doesn't exist
          allowedValues: ["value1", "value2"],
        },
      });

      expect(response.status()).toBe(404);
      const body = await response.json();
      expect(body.status).toBe("fail");
      expect(body.message).toContain("Category not found");
    });

    test("Setup: Create first category", async ({ request }) => {
      const response = await request.post("materials/categories", {
        data: {
          name: `Category_${randomString(8)}`,
          description: "Test category for FK validation",
        },
      });

      expect(response.status()).toBe(201);
      const body = await response.json();
      categoryId1 = body.data.category._id;
    });

    test("should accept attribute creation with valid categoryId", async ({
      request,
    }) => {
      const response = await request.post("materials/attributes", {
        data: {
          name: `Test_Attr_Valid_${randomString(8)}`,
          categoryId: categoryId1,
          allowedValues: ["value1", "value2"],
        },
      });

      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body.status).toBe("success");
      expect(body.data.attribute.categoryId).toBe(categoryId1);
      attributeId1 = body.data.attribute._id;
    });

    test("should reject updating attribute categoryId to invalid category", async ({
      request,
    }) => {
      // Try to update with invalid categoryId
      const updateResponse = await request.patch(
        `materials/attributes/${attributeId1}`,
        {
          data: {
            categoryId: "507f1f77bcf86cd799439011",
          },
        },
      );

      expect(updateResponse.status()).toBe(404);
      const body = await updateResponse.json();
      expect(body.message).toContain("Category not found");
    });
  });

  test.describe("2. Orphaned isRequired Field Removal", () => {
    test("should not allow isRequired in attribute creation payload", async ({
      request,
    }) => {
      const response = await request.post("materials/attributes", {
        data: {
          name: `Test_Attr_${randomString(8)}`,
          isRequired: true, // This should be ignored at attribute level
          allowedValues: [],
        },
      });

      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body.data.attribute).not.toHaveProperty("isRequired");
    });

    test("should keep isRequired only at MaterialType level, not attribute level", async ({
      request,
    }) => {
      // Create attribute (no isRequired field)
      const attrResponse = await request.post("materials/attributes", {
        data: {
          name: `Test_Attr_Type_${randomString(8)}`,
          allowedValues: ["value1", "value2"],
        },
      });

      const attrData = await attrResponse.json();
      const attrId = attrData.data.attribute._id;

      // Create MaterialType with isRequired at type level
      const typeResponse = await request.post("materials/types", {
        data: {
          name: `Material_${randomString(8)}`,
          description: "Test",
          pricePerDay: 100,
          categoryId: [],
          attributes: [
            {
              attributeId: attrId,
              value: "value1",
              isRequired: true, // Required at type level
            },
          ],
        },
      });

      expect(typeResponse.status()).toBe(201);
      const typeData = await typeResponse.json();
      expect(typeData.data.materialType.attributes[0].isRequired).toBe(true);
    });
  });

  test.describe("3. Audit Endpoints for Orphaned Values", () => {
    test("GET /audit/orphaned-attribute-values should work", async ({
      request,
    }) => {
      const response = await request.get(
        "materials/audit/orphaned-attribute-values",
      );

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.status).toBe("success");
      expect(body.data).toHaveProperty("orphanedCount");
      expect(body.data).toHaveProperty("orphanedMaterials");
      expect(Array.isArray(body.data.orphanedMaterials)).toBe(true);
    });

    test("should prevent narrowing allowedValues when material types use old values", async ({
      request,
    }) => {
      // Create attribute with allowedValues
      const attrResponse = await request.post("materials/attributes", {
        data: {
          name: `Audit_Attr_${randomString(8)}`,
          allowedValues: ["1080p", "4K"],
        },
      });

      const attrData = await attrResponse.json();
      const attrId = attrData.data.attribute._id;

      // Create material type with one of the values
      const typeResponse = await request.post("materials/types", {
        data: {
          name: `Audit_Material_${randomString(8)}`,
          description: "Test",
          pricePerDay: 100,
          categoryId: [],
          attributes: [
            {
              attributeId: attrId,
              value: "1080p",
              isRequired: false,
            },
          ],
        },
      });

      expect(typeResponse.status()).toBe(201);

      // Now try to narrow the attribute's allowedValues
      const updateAttrResponse = await request.patch(
        `materials/attributes/${attrId}`,
        {
          data: {
            allowedValues: ["4K", "8K"], // Remove "1080p"
          },
        },
      );

      expect(updateAttrResponse.status()).toBe(400); // Should fail due to existing value
      const updateError = await updateAttrResponse.json();
      expect(updateError.details?.code).toBe("ALLOWED_VALUES_IN_USE");
    });
  });

  test.describe("4. Attribute Deletion Impact Audit", () => {
    test("Setup: Create second category", async ({ request }) => {
      const response = await request.post("materials/categories", {
        data: {
          name: `Category2_${randomString(8)}`,
          description: "Test category 2",
        },
      });

      expect(response.status()).toBe(201);
      const body = await response.json();
      categoryId2 = body.data.category._id;
    });

    test("should show cascade impact when deleting an attribute", async ({
      request,
    }) => {
      // Create attribute
      const attrResponse = await request.post("materials/attributes", {
        data: {
          name: `Impact_Audit_${randomString(8)}`,
          allowedValues: [],
        },
      });

      const attrData = await attrResponse.json();
      const attrId = attrData.data.attribute._id;

      // Create material type using this attribute
      const typeResponse = await request.post("materials/types", {
        data: {
          name: `Impact_Material_${randomString(8)}`,
          description: "Test",
          pricePerDay: 100,
          categoryId: [],
          attributes: [
            {
              attributeId: attrId,
              value: "test",
              isRequired: true,
            },
          ],
        },
      });

      expect(typeResponse.status()).toBe(201);

      // Now check impact of deletion
      const impactResponse = await request.get(
        `materials/audit/attribute-deletion-impact/${attrId}`,
      );

      expect(impactResponse.status()).toBe(200);
      const impactData = await impactResponse.json();
      expect(impactData.status).toBe("success");
      expect(impactData.data.attributeId).toBe(attrId);
      expect(impactData.data.affectedMaterialCount).toBeGreaterThan(0);
      expect(Array.isArray(impactData.data.affectedMaterials)).toBe(true);
    });

    test("should show which attributes are required in deletion impact", async ({
      request,
    }) => {
      // Create attribute
      const attrResponse = await request.post("materials/attributes", {
        data: {
          name: `Impact_Required_${randomString(8)}`,
          allowedValues: [],
        },
      });

      const attrData = await attrResponse.json();
      const attrId = attrData.data.attribute._id;

      // Create material with required attribute
      const typeResponse = await request.post("materials/types", {
        data: {
          name: `Impact_Required_Material_${randomString(8)}`,
          description: "Test",
          pricePerDay: 100,
          categoryId: [],
          attributes: [
            {
              attributeId: attrId,
              value: "test",
              isRequired: true,
            },
          ],
        },
      });

      expect(typeResponse.status()).toBe(201);

      // Check impact to see isRequired flag
      const impactResponse = await request.get(
        `materials/audit/attribute-deletion-impact/${attrId}`,
      );

      expect(impactResponse.status()).toBe(200);
      const impactData = await impactResponse.json();
      expect(impactData.data.affectedMaterials.length).toBeGreaterThan(0);

      const material = impactData.data.affectedMaterials[0];
      expect(material).toHaveProperty("isRequired");
      expect(material.isRequired).toBe(true);
    });
  });

  test.describe("5. Multi-Category Consistency", () => {
    test("should allow material type in multiple categories", async ({
      request,
    }) => {
      // Create attributes scoped to each category
      const attr1Response = await request.post("materials/attributes", {
        data: {
          name: `Attr_Cat1_${randomString(8)}`,
          categoryId: categoryId1,
          allowedValues: ["val1"],
        },
      });

      const attr1Data = await attr1Response.json();
      const attr1Id = attr1Data.data.attribute._id;

      const attr2Response = await request.post("materials/attributes", {
        data: {
          name: `Attr_Cat2_${randomString(8)}`,
          categoryId: categoryId2,
          allowedValues: ["val2"],
        },
      });

      const attr2Data = await attr2Response.json();
      const attr2Id = attr2Data.data.attribute._id;

      // Create material type in both categories with both attributes
      const typeResponse = await request.post("materials/types", {
        data: {
          name: `DualCategory_Material_${randomString(8)}`,
          description: "Material in two categories",
          pricePerDay: 100,
          categoryId: [categoryId1, categoryId2],
          attributes: [
            { attributeId: attr1Id, value: "val1", isRequired: false },
            { attributeId: attr2Id, value: "val2", isRequired: false },
          ],
        },
      });

      expect(typeResponse.status()).toBe(201);
      const typeData = await typeResponse.json();
      expect(typeData.data.materialType.categoryId).toContain(categoryId1);
      expect(typeData.data.materialType.categoryId).toContain(categoryId2);
    });

    test("should reject attribute use from non-member category", async ({
      request,
    }) => {
      // Create attribute scoped to cat1
      const attrResponse = await request.post("materials/attributes", {
        data: {
          name: `RejectAttr_${randomString(8)}`,
          categoryId: categoryId1,
          allowedValues: ["val1"],
        },
      });

      const attrData = await attrResponse.json();
      const attrId = attrData.data.attribute._id;

      // Try to create material NOT in categoryId1 using this attribute
      const typeResponse = await request.post("materials/types", {
        data: {
          name: `RejectMaterial_${randomString(8)}`,
          description: "Material",
          pricePerDay: 100,
          categoryId: [], // Not in categoryId1
          attributes: [
            { attributeId: attrId, value: "val1", isRequired: false },
          ],
        },
      });

      expect(typeResponse.status()).toBe(400);
      const typeError = await typeResponse.json();
      expect(typeError.details?.code).toBe("ATTRIBUTE_CATEGORY_MISMATCH");
    });
  });
});
