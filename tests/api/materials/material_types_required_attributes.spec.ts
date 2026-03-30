import { test, expect } from "@playwright/test";

test.describe.serial("Material Types with Required Attributes", () => {
  let categoryId: string;
  let attributeId1: string;
  let attributeId2: string;
  let attributeId3: string;

  // ── Setup: Create category and attributes ──────────────────────────

  test("Setup: Create a category for testing", async ({ request }) => {
    const res = await request.post("materials/categories", {
      data: {
        name: `RequiredAttrCat ${Date.now()}`,
        description: "Category for required attribute tests",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    categoryId = body.data.category._id;
  });

  test("Setup: Create first attribute (optional by default)", async ({
    request,
  }) => {
    const res = await request.post("materials/attributes", {
      data: {
        name: `Warranty ${Date.now()}`,
        unit: "months",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    attributeId1 = body.data.attribute._id;
  });

  test("Setup: Create second attribute for default required testing", async ({
    request,
  }) => {
    const res = await request.post("materials/attributes", {
      data: {
        name: `Color ${Date.now()}`,
        allowedValues: ["Red", "Blue", "Green"],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    attributeId2 = body.data.attribute._id;
  });

  test("Setup: Create third attribute for category-scoped required tests", async ({
    request,
  }) => {
    if (!categoryId) test.skip();
    const res = await request.post("materials/attributes", {
      data: {
        name: `ModelNumber ${Date.now()}`,
        categoryId,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    attributeId3 = body.data.attribute._id;
  });

  // ── Happy path: Required attribute validation ──────────────────────

  test("POST /materials/types - should create material type with required attribute", async ({
    request,
  }) => {
    if (!categoryId || !attributeId1) test.skip();
    const res = await request.post("materials/types", {
      data: {
        name: `CameraWithWarranty ${Date.now()}`,
        categoryId: [categoryId],
        description: "Camera with required warranty field",
        pricePerDay: 1500,
        attributes: [
          {
            attributeId: attributeId1,
            value: "24",
            isRequired: true,
          },
        ],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.materialType.attributes).toHaveLength(1);
    expect(body.data.materialType.attributes[0]).toMatchObject({
      attributeId: attributeId1,
      value: "24",
      isRequired: true,
    });
  });

  test("POST /materials/types - should create material type with optional attribute", async ({
    request,
  }) => {
    if (!categoryId || !attributeId2) test.skip();
    const res = await request.post("materials/types", {
      data: {
        name: `CameraOptionalColor ${Date.now()}`,
        categoryId: [categoryId],
        description: "Camera with optional color field",
        pricePerDay: 1200,
        attributes: [
          {
            attributeId: attributeId2,
            value: "Red",
            isRequired: false,
          },
        ],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.materialType.attributes[0].isRequired).toBe(false);
  });

  test("POST /materials/types - should create material type with mixed required/optional attributes", async ({
    request,
  }) => {
    if (!categoryId || !attributeId1 || !attributeId2) test.skip();
    const res = await request.post("materials/types", {
      data: {
        name: `CameraMixed ${Date.now()}`,
        categoryId: [categoryId],
        description: "Camera with both required and optional attributes",
        pricePerDay: 1600,
        attributes: [
          {
            attributeId: attributeId1,
            value: "12",
            isRequired: true,
          },
          {
            attributeId: attributeId2,
            value: "Blue",
            isRequired: false,
          },
        ],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.materialType.attributes).toHaveLength(2);
    const requiredAttr = body.data.materialType.attributes.find(
      (a: { attributeId: string }) => a.attributeId === attributeId1,
    );
    const optionalAttr = body.data.materialType.attributes.find(
      (a: { attributeId: string }) => a.attributeId === attributeId2,
    );
    expect(requiredAttr.isRequired).toBe(true);
    expect(optionalAttr.isRequired).toBe(false);
  });

  test("POST /materials/types - should create material type without attributes", async ({
    request,
  }) => {
    if (!categoryId) test.skip();
    const res = await request.post("materials/types", {
      data: {
        name: `CameraNoAttrs ${Date.now()}`,
        categoryId: [categoryId],
        description: "Camera without any attributes",
        pricePerDay: 1100,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.materialType.attributes).toHaveLength(0);
  });

  test("POST /materials/types - should default isRequired to false when not provided", async ({
    request,
  }) => {
    if (!categoryId || !attributeId2) test.skip();
    const res = await request.post("materials/types", {
      data: {
        name: `CameraDefaultRequired ${Date.now()}`,
        categoryId: [categoryId],
        description: "Test default isRequired value",
        pricePerDay: 1300,
        attributes: [
          {
            attributeId: attributeId2,
            value: "Green",
            // isRequired NOT provided - should default to false
          },
        ],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.materialType.attributes[0].isRequired).toBe(false);
  });

  // ── Error cases: Required attribute validation ───────────────────────

  test("POST /materials/types - should reject if required attribute has empty value", async ({
    request,
  }) => {
    if (!categoryId || !attributeId1) test.skip();
    const res = await request.post("materials/types", {
      data: {
        name: `CameraEmptyRequired ${Date.now()}`,
        categoryId: [categoryId],
        description: "Test empty required attribute",
        pricePerDay: 1400,
        attributes: [
          {
            attributeId: attributeId1,
            value: "",
            isRequired: true,
          },
        ],
      },
    });
    // Zod validation should catch empty value
    expect(res.status()).toBe(400);
  });

  test("POST /materials/types - should accept optional attribute with empty value (but Zod rejects anyway)", async ({
    request,
  }) => {
    if (!categoryId || !attributeId1) test.skip();
    // Note: Zod requires value to be min(1), so this should fail at Zod layer, not business logic
    const res = await request.post("materials/types", {
      data: {
        name: `CameraOptionalEmpty ${Date.now()}`,
        categoryId: [categoryId],
        description: "Test optional attribute with empty value",
        pricePerDay: 1450,
        attributes: [
          {
            attributeId: attributeId1,
            value: "",
            isRequired: false,
          },
        ],
      },
    });
    expect(res.status()).toBe(400);
  });

  // ── Update scenarios ─────────────────────────────────────────────────

  test("PATCH /materials/types/:id - should update attribute to mark as required", async ({
    request,
  }) => {
    if (!categoryId || !attributeId1 || !attributeId2) test.skip();
    // First create a material type with optional attributes
    const createRes = await request.post("materials/types", {
      data: {
        name: `CameraUpdateRequired ${Date.now()}`,
        categoryId: [categoryId],
        description: "Material type to test update",
        pricePerDay: 1700,
        attributes: [
          {
            attributeId: attributeId1,
            value: "18",
            isRequired: false,
          },
          {
            attributeId: attributeId2,
            value: "Red",
            isRequired: false,
          },
        ],
      },
    });
    expect(createRes.status()).toBe(201);
    const createBody = await createRes.json();
    const typeId = createBody.data.materialType._id;

    // Now update to mark first attribute as required
    const updateRes = await request.patch(`materials/types/${typeId}`, {
      data: {
        attributes: [
          {
            attributeId: attributeId1,
            value: "18",
            isRequired: true, // Changed to required
          },
          {
            attributeId: attributeId2,
            value: "Red",
            isRequired: false,
          },
        ],
      },
    });
    expect(updateRes.status()).toBe(200);
    const updateBody = await updateRes.json();
    const updatedAttr1 = updateBody.data.materialType.attributes.find(
      (a: { attributeId: string }) => a.attributeId === attributeId1,
    );
    expect(updatedAttr1.isRequired).toBe(true);
  });

  test("PATCH /materials/types/:id - should add a required attribute", async ({
    request,
  }) => {
    if (!categoryId || !attributeId1 || !attributeId3) test.skip();
    // Create a material type with one optional attribute
    const createRes = await request.post("materials/types", {
      data: {
        name: `CameraAddRequired ${Date.now()}`,
        categoryId: [categoryId],
        description: "Material type to add required attribute",
        pricePerDay: 1800,
        attributes: [
          {
            attributeId: attributeId1,
            value: "12",
            isRequired: false,
          },
        ],
      },
    });
    expect(createRes.status()).toBe(201);
    const createBody = await createRes.json();
    const typeId = createBody.data.materialType._id;

    // Now add a required attribute
    const updateRes = await request.patch(`materials/types/${typeId}`, {
      data: {
        attributes: [
          {
            attributeId: attributeId1,
            value: "12",
            isRequired: false,
          },
          {
            attributeId: attributeId3,
            value: "MDL-2024-001",
            isRequired: true,
          },
        ],
      },
    });
    expect(updateRes.status()).toBe(200);
    const updateBody = await updateRes.json();
    expect(updateBody.data.materialType.attributes).toHaveLength(2);
    const newAttr = updateBody.data.materialType.attributes.find(
      (a: { attributeId: string }) => a.attributeId === attributeId3,
    );
    expect(newAttr.isRequired).toBe(true);
  });

  test("PATCH /materials/types/:id - should remove an optional attribute", async ({
    request,
  }) => {
    if (!categoryId || !attributeId1 || !attributeId2) test.skip();
    // Create with two attributes
    const createRes = await request.post("materials/types", {
      data: {
        name: `CameraRemoveAttr ${Date.now()}`,
        categoryId: [categoryId],
        description: "Material type to remove attribute",
        pricePerDay: 1900,
        attributes: [
          {
            attributeId: attributeId1,
            value: "24",
            isRequired: false,
          },
          {
            attributeId: attributeId2,
            value: "Blue",
            isRequired: false,
          },
        ],
      },
    });
    expect(createRes.status()).toBe(201);
    const createBody = await createRes.json();
    const typeId = createBody.data.materialType._id;

    // Remove the second attribute
    const updateRes = await request.patch(`materials/types/${typeId}`, {
      data: {
        attributes: [
          {
            attributeId: attributeId1,
            value: "24",
            isRequired: false,
          },
        ],
      },
    });
    expect(updateRes.status()).toBe(200);
    const updateBody = await updateRes.json();
    expect(updateBody.data.materialType.attributes).toHaveLength(1);
    expect(updateBody.data.materialType.attributes[0].attributeId).toBe(
      attributeId1,
    );
  });

  // ── Two material types treating same attribute differently ──────────

  test("Material Types with different required status for same attribute", async ({
    request,
  }) => {
    if (!categoryId || !attributeId2) test.skip();
    // Type 1: Color is required
    const type1Res = await request.post("materials/types", {
      data: {
        name: `CameraColorRequired ${Date.now()}`,
        categoryId: [categoryId],
        description: "Camera where color is required",
        pricePerDay: 2000,
        attributes: [
          {
            attributeId: attributeId2,
            value: "Red",
            isRequired: true,
          },
        ],
      },
    });
    expect(type1Res.status()).toBe(201);
    const type1Body = await type1Res.json();
    expect(type1Body.data.materialType.attributes[0].isRequired).toBe(true);

    // Type 2: Color is optional
    const type2Res = await request.post("materials/types", {
      data: {
        name: `CameraColorOptional ${Date.now()}`,
        categoryId: [categoryId],
        description: "Camera where color is optional",
        pricePerDay: 2100,
        attributes: [
          {
            attributeId: attributeId2,
            value: "Green",
            isRequired: false,
          },
        ],
      },
    });
    expect(type2Res.status()).toBe(201);
    const type2Body = await type2Res.json();
    expect(type2Body.data.materialType.attributes[0].isRequired).toBe(false);

    // Same attribute, different requirement status
    expect(type1Body.data.materialType.attributes[0].attributeId).toBe(
      type2Body.data.materialType.attributes[0].attributeId,
    );
    expect(type1Body.data.materialType.attributes[0].isRequired).not.toBe(
      type2Body.data.materialType.attributes[0].isRequired,
    );
  });

  // ── Enum validation with per-type required ───────────────────────────

  test("POST /materials/types - should reject invalid enum value even if required=true", async ({
    request,
  }) => {
    if (!categoryId || !attributeId2) test.skip();
    const res = await request.post("materials/types", {
      data: {
        name: `CameraInvalidColor ${Date.now()}`,
        categoryId: [categoryId],
        description: "Test invalid enum value",
        pricePerDay: 2200,
        attributes: [
          {
            attributeId: attributeId2,
            value: "Yellow", // Not in [Red, Blue, Green]
            isRequired: true,
          },
        ],
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.status).toBe("fail");
  });

  test("POST /materials/types - should accept valid enum value with required=true", async ({
    request,
  }) => {
    if (!categoryId || !attributeId2) test.skip();
    const res = await request.post("materials/types", {
      data: {
        name: `CameraValidColor ${Date.now()}`,
        categoryId: [categoryId],
        description: "Test valid enum value",
        pricePerDay: 2300,
        attributes: [
          {
            attributeId: attributeId2,
            value: "Blue",
            isRequired: true,
          },
        ],
      },
    });
    expect(res.status()).toBe(201);
  });
});
