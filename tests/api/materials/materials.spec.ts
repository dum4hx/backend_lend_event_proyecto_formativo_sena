import { test, expect } from "@playwright/test";

test.describe("Materials Module", () => {
  let categoryId: string;
  let materialTypeId: string;

  test("POST /materials/categories - should create category", async ({
    request,
  }) => {
    const res = await request.post("materials/categories", {
      data: { name: `Cameras ${Date.now()}`, description: "Test Cat" },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    categoryId = body.data.category.id;
  });

  test("GET /materials/categories - should list categories", async ({
    request,
  }) => {
    const res = await request.get("materials/categories");
    expect(res.status()).toBe(200);
  });

  // Dependent on category
  test("POST /materials/types - should create material type", async ({
    request,
  }) => {
    if (!categoryId) test.skip();
    const res = await request.post("materials/types", {
      data: {
        name: `Canon ${Date.now()}`,
        sku: `CAM-${Date.now()}`,
        categoryId,
        description: "Desc",
        pricePerDay: 1000,
        replacementValue: 50000,
        specifications: { sensor: "CMOS" },
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    materialTypeId = body.data.materialType.id;
  });

  // Dependent on type
  test("POST /materials/instances - should create instance", async ({
    request,
  }) => {
    if (!materialTypeId) test.skip();
    const res = await request.post("materials/instances", {
      data: {
        materialTypeId,
        serialNumber: `SN-${Date.now()}`,
        locationId: "LOC-001", // Assuming string or mocked
        purchaseDate: "2024-01-01",
        purchasePrice: 10000,
      },
    });
    expect(res.status()).toBe(201);
  });

  // GET /materials/types, GET /materials/instances, PATCH /instances/:id/status
});
