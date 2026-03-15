import { test, expect } from "@playwright/test";

test.describe.serial("Materials Module", () => {
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
    categoryId = body.data.category._id;
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
        categoryId,
        description: "A camera material type",
        pricePerDay: 1000,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    materialTypeId = body.data.materialType._id;
  });

  // Dependent on type
  test("POST /materials/instances - should create instance", async ({
    request,
  }) => {
    if (!materialTypeId) test.skip();

    // First create a location to use as locationId
    const locRes = await request.post("locations", {
      data: {
        name: `Instance Loc ${Date.now()}`,
        address: {
          country: "Colombia",
          city: "Medellín",
          street: "Calle 10",
          propertyNumber: "1",
        },
      },
    });
    const locBody = await locRes.json();
    const locationId = locBody.data._id;

    const res = await request.post("materials/instances", {
      data: {
        modelId: materialTypeId,
        serialNumber: `SN-${Date.now()}`,
        locationId,
      },
    });
    expect(res.status()).toBe(201);
  });

  // GET /materials/types, GET /materials/instances, PATCH /instances/:id/status
});
