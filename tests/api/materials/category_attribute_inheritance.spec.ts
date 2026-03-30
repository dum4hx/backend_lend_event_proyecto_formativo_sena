import { test, expect } from "@playwright/test";

/**
 * Test the new Category-Based Attribute Inheritance architecture.
 *
 * New Flow:
 * 1. Categories define which attributes belong to them
 * 2. MaterialTypes reference categories and inherit their attributes
 * 3. MaterialTypes can override the isRequired status per-attribute
 * 4. Validation ensures attributes come from the type's categories
 */
test.describe.serial("Category-Based Attribute Inheritance", () => {
  let categoryId1: string;
  let categoryId2: string;
  let attributeId1: string;
  let attributeId2: string;
  let attributeId3: string;

  const randomString = (length: number = 8) =>
    Math.random()
      .toString(36)
      .substring(2, length + 2);

  // Setup: Create attributes
  test("Setup: Create attribute 1 (lens)", async ({ request }) => {
    const res = await request.post("materials/attributes", {
      data: {
        name: `Lens ${randomString(8)}`,
        unit: "mm",
        allowedValues: ["50", "35", "70"],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    attributeId1 = body.data.attribute._id;
  });

  test("Setup: Create attribute 2 (warranty)", async ({ request }) => {
    const res = await request.post("materials/attributes", {
      data: {
        name: `Warranty ${randomString(8)}`,
        unit: "months",
        allowedValues: ["12", "24", "36"],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    attributeId2 = body.data.attribute._id;
  });

  test("Setup: Create attribute 3 (resolution)", async ({ request }) => {
    const res = await request.post("materials/attributes", {
      data: {
        name: `Resolution ${randomString(8)}`,
        allowedValues: ["1080p", "4K", "8K"],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    attributeId3 = body.data.attribute._id;
  });

  // Setup: Create categories with attributes
  test("Setup: Create category 1 (Cameras) with lens and warranty", async ({
    request,
  }) => {
    if (!attributeId1 || !attributeId2) test.skip();
    const res = await request.post("materials/categories", {
      data: {
        name: `Cameras ${randomString(8)}`,
        description: "Camera equipment",
        attributes: [
          { attributeId: attributeId1, isRequired: true }, // lens is required
          { attributeId: attributeId2, isRequired: false }, // warranty is optional
        ],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    categoryId1 = body.data.category._id;
  });

  test("Setup: Create category 2 (Lenses) with resolution", async ({
    request,
  }) => {
    if (!attributeId3) test.skip();
    const res = await request.post("materials/categories", {
      data: {
        name: `Lenses ${randomString(8)}`,
        description: "Lens equipment",
        attributes: [{ attributeId: attributeId3, isRequired: true }], // resolution is required
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    categoryId2 = body.data.category._id;
  });

  // Test: Single-category material type
  test("Should create material type with single category attributes", async ({
    request,
  }) => {
    if (!categoryId1 || !attributeId1 || !attributeId2) test.skip();
    const res = await request.post("materials/types", {
      data: {
        name: `Canon ${randomString(8)}`,
        categoryId: [categoryId1],
        description: "Camera",
        pricePerDay: 1000,
        attributes: [
          { attributeId: attributeId1, value: "50", isRequired: true }, // from category
          { attributeId: attributeId2, value: "24", isRequired: true }, // from category, override to required
        ],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.materialType.attributes).toHaveLength(2);
    expect(body.data.materialType.attributes[0].isRequired).toBe(true);
    expect(body.data.materialType.attributes[1].isRequired).toBe(true); // overridden
  });

  // Test: Multi-category material type
  test("Should create material type with multiple categories (inherits union of attributes)", async ({
    request,
  }) => {
    if (
      !categoryId1 ||
      !categoryId2 ||
      !attributeId1 ||
      !attributeId2 ||
      !attributeId3
    )
      test.skip();
    const res = await request.post("materials/types", {
      data: {
        name: `Lens Holder ${randomString(8)}`,
        categoryId: [categoryId1, categoryId2], // Both Cameras and Lenses
        description: "Holds lenses for cameras",
        pricePerDay: 200,
        attributes: [
          { attributeId: attributeId1, value: "50", isRequired: false }, // from Cameras category
          { attributeId: attributeId2, value: "12", isRequired: false }, // from Cameras category
          { attributeId: attributeId3, value: "4K", isRequired: true }, // from Lenses category
        ],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.materialType.attributes).toHaveLength(3);
    const resolAttr = body.data.materialType.attributes.find(
      (a: { attributeId: string }) => a.attributeId === attributeId3,
    );
    expect(resolAttr.isRequired).toBe(true);
  });

  // Test: Reject attribute not in category
  test("Should reject attribute that is not in any of the type's categories", async ({
    request,
  }) => {
    if (!categoryId1 || !attributeId3) test.skip();
    // categoryId1 has attributeId1 and attributeId2, but NOT attributeId3
    // Try to create type in category1 with attribute3
    const res = await request.post("materials/types", {
      data: {
        name: `Invalid ${randomString(8)}`,
        categoryId: [categoryId1],
        description: "Invalid type",
        pricePerDay: 100,
        attributes: [
          { attributeId: attributeId3, value: "4K", isRequired: false }, // Not in categoryId1!
        ],
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("BAD_REQUEST");
    expect(body.message).toContain("not available");
  });

  // Test: Category without attributes still allows type creation
  test("Should allow material type with empty attributes when needed", async ({
    request,
  }) => {
    if (!categoryId1) test.skip();
    const res = await request.post("materials/categories", {
      data: {
        name: `Empty ${randomString(8)}`,
        description: "Category with no attributes",
      },
    });
    expect(res.status()).toBe(201);
    const emptyBody = await res.json();
    const emptyCategoryId = emptyBody.data.category._id;

    const typeRes = await request.post("materials/types", {
      data: {
        name: `Generic ${randomString(8)}`,
        categoryId: [emptyCategoryId],
        description: "Generic type",
        pricePerDay: 50,
        // No attributes required
      },
    });
    expect(typeRes.status()).toBe(201);
    const typeBody = await typeRes.json();
    expect(typeBody.data.materialType.attributes).toHaveLength(0);
  });
});
