import { test, expect } from "@playwright/test";

test.describe("Location Capacity Module", () => {
  let locationId: string;
  let materialTypeId: string;

  test.beforeAll(async ({ request }) => {
    // 1. Create a category
    const catRes = await request.post("materials/categories", {
      data: {
        name: `Capacity Test Cat ${Date.now()}`,
        description: "Testing capacity",
      },
    });
    const catBody = await catRes.json();
    const categoryId = catBody.data.category._id;

    // 2. Create a material type
    const typeRes = await request.post("materials/types", {
      data: {
        name: `Capacity Material ${Date.now()}`,
        categoryId,
        description: "Test Material Type",
        pricePerDay: 100,
      },
    });
    const typeBody = await typeRes.json();
    materialTypeId = typeBody.data.materialType._id;

    // 3. Create a location with capacity for 1 of this material type
    const locRes = await request.post("locations", {
      data: {
        name: `Capacity Warehouse ${Date.now()}`,
        address: {
          streetType: "Calle",
          primaryNumber: "10",
          secondaryNumber: "12",
          complementaryNumber: "3",
          department: "Antioquia",
          city: "Medellín",
        },
        materialCapacities: [
          {
            materialTypeId: materialTypeId,
            maxQuantity: 1,
          },
        ],
      },
    });
    const locBody = await locRes.json();
    locationId = locBody.data._id;
  });

  test("Should enforce capacity limit and then allow override with force flag", async ({
    request,
  }) => {
    // 1. Create first instance (should succeed, occupancy goes to 1)
    const res1 = await request.post("materials/instances", {
      data: {
        modelId: materialTypeId,
        serialNumber: `SN-1-${Date.now()}`,
        locationId: locationId,
      },
    });
    expect(res1.status()).toBe(201);

    // 2. Try creating second instance (should fail with 409 Conflict)
    const res2 = await request.post("materials/instances", {
      data: {
        modelId: materialTypeId,
        serialNumber: `SN-2-${Date.now()}`,
        locationId: locationId,
      },
    });
    expect(res2.status()).toBe(409);
    const body2 = await res2.json();
    expect(body2.status).toBe("fail");
    expect(body2.details.type).toBe("CAPACITY_WARNING");

    // 3. Create second instance with force=true (should succeed)
    const res3 = await request.post("materials/instances", {
      data: {
        modelId: materialTypeId,
        serialNumber: `SN-2-${Date.now()}`,
        locationId: locationId,
        force: true,
      },
    });
    expect(res3.status()).toBe(201);
  });
});
