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
          streetType: "Calle",
          primaryNumber: "10",
          secondaryNumber: "1",
          complementaryNumber: "0",
          department: "Antioquia",
          city: "Medellín",
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
  test("GET /materials/instances - should return flat list of instances by default", async ({
    request,
  }) => {
    const res = await request.get("materials/instances");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data).toHaveProperty("instances");
    expect(Array.isArray(body.data.instances)).toBe(true);
    expect(body.data).toHaveProperty("total");

    if (body.data.instances.length > 0) {
      const instance = body.data.instances[0];
      expect(instance).toHaveProperty("modelId");
      expect(instance).toHaveProperty("locationId");
      expect(instance).toHaveProperty("serialNumber");
    }
  });

  test("GET /materials/instances - should return instances grouped by location when byLocation=true", async ({
    request,
  }) => {
    const res = await request.get("materials/instances?byLocation=true");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data).toHaveProperty("byLocation");
    expect(Array.isArray(body.data.byLocation)).toBe(true);
    expect(body.data).toHaveProperty("total");

    // Each group must have a location object and an instances array
    for (const group of body.data.byLocation) {
      expect(group).toHaveProperty("location");
      expect(group.location).toHaveProperty("_id");
      expect(Array.isArray(group.instances)).toBe(true);
    }
  });
});
