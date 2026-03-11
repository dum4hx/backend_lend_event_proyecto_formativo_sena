import { test, expect } from "@playwright/test";

test.describe("Material Attributes Module", () => {
  let attributeId: string;
  let categoryId: string;

  // ── Setup: create a category so we can test category-scoped attributes ──

  test("POST /materials/categories - create category for attribute tests", async ({
    request,
  }) => {
    const res = await request.post("materials/categories", {
      data: { name: `AttrTestCat ${Date.now()}`, description: "Attr test" },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    categoryId = body.data.category.id;
  });

  // ── Happy path: CRUD ──────────────────────────────────────────────────

  test("POST /materials/attributes - should create a free-form attribute", async ({
    request,
  }) => {
    const res = await request.post("materials/attributes", {
      data: {
        name: `Weight ${Date.now()}`,
        unit: "kg",
        isRequired: false,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.attribute).toMatchObject({
      name: expect.stringContaining("Weight"),
      unit: "kg",
      isRequired: false,
      allowedValues: [],
    });
    attributeId = body.data.attribute._id;
  });

  test("POST /materials/attributes - should create an enum-restricted attribute", async ({
    request,
  }) => {
    const res = await request.post("materials/attributes", {
      data: {
        name: `RAM ${Date.now()}`,
        unit: "GB",
        allowedValues: ["4", "8", "16", "32"],
        isRequired: true,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.attribute.allowedValues).toEqual(["4", "8", "16", "32"]);
    expect(body.data.attribute.isRequired).toBe(true);
  });

  test("POST /materials/attributes - should create a category-scoped attribute", async ({
    request,
  }) => {
    if (!categoryId) test.skip();
    const res = await request.post("materials/attributes", {
      data: {
        name: `Sensor ${Date.now()}`,
        unit: "MP",
        categoryId,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.attribute.categoryId).toBe(categoryId);
  });

  test("GET /materials/attributes - should list all attributes", async ({
    request,
  }) => {
    const res = await request.get("materials/attributes");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data.attributes)).toBe(true);
    expect(body.data.attributes.length).toBeGreaterThan(0);
  });

  test("GET /materials/attributes - should filter by categoryId", async ({
    request,
  }) => {
    if (!categoryId) test.skip();
    const res = await request.get(
      `materials/attributes?categoryId=${categoryId}`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data.attributes)).toBe(true);
    body.data.attributes.forEach((attr: { categoryId: string }) => {
      expect(attr.categoryId).toBe(categoryId);
    });
  });

  test("GET /materials/attributes/:id - should get a specific attribute", async ({
    request,
  }) => {
    if (!attributeId) test.skip();
    const res = await request.get(`materials/attributes/${attributeId}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.attribute._id).toBe(attributeId);
  });

  test("PATCH /materials/attributes/:id - should update attribute name and unit", async ({
    request,
  }) => {
    if (!attributeId) test.skip();
    const res = await request.patch(`materials/attributes/${attributeId}`, {
      data: { unit: "lbs" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.attribute.unit).toBe("lbs");
  });

  test("DELETE /materials/attributes/:id - should delete unused attribute", async ({
    request,
  }) => {
    if (!attributeId) test.skip();
    const res = await request.delete(`materials/attributes/${attributeId}`);
    expect(res.status()).toBe(200);
  });

  // ── Error cases ───────────────────────────────────────────────────────

  test("POST /materials/attributes - should return 400 for missing required fields", async ({
    request,
  }) => {
    const res = await request.post("materials/attributes", {
      data: { name: "NoUnit" }, // missing unit
    });
    expect(res.status()).toBe(400);
  });

  test("POST /materials/attributes - should return 409 on duplicate name", async ({
    request,
  }) => {
    const uniqueName = `DupAttr ${Date.now()}`;
    const first = await request.post("materials/attributes", {
      data: { name: uniqueName, unit: "cm" },
    });
    expect(first.status()).toBe(201);

    const second = await request.post("materials/attributes", {
      data: { name: uniqueName, unit: "mm" },
    });
    expect(second.status()).toBe(409);
  });

  test("GET /materials/attributes/:id - should return 404 for unknown id", async ({
    request,
  }) => {
    const res = await request.get(
      "materials/attributes/000000000000000000000000",
    );
    expect(res.status()).toBe(404);
  });

  test("PATCH /materials/attributes/:id - should return 404 for unknown id", async ({
    request,
  }) => {
    const res = await request.patch(
      "materials/attributes/000000000000000000000000",
      { data: { unit: "kg" } },
    );
    expect(res.status()).toBe(404);
  });

  test("DELETE /materials/attributes/:id - should return 404 for unknown id", async ({
    request,
  }) => {
    const res = await request.delete(
      "materials/attributes/000000000000000000000000",
    );
    expect(res.status()).toBe(404);
  });
});
