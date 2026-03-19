import { test, expect } from "@playwright/test";
import {
  generateRandomName,
  generateRandomSerial,
} from "../../utils/helpers.ts";

test.describe("Material Instance Location Quantity Hook", () => {
  let locationId: string;
  let materialTypeId: string;
  let otherLocationId: string;

  test.beforeAll(async ({ request }) => {
    // 1. Create a category
    const catRes = await request.post("materials/categories", {
      data: {
        name: generateRandomName("Hook Test Cat"),
        description: "Testing hooks",
      },
    });
    const catBody = await catRes.json();
    const categoryId = catBody.data.category._id;

    // 2. Create a material type
    const typeRes = await request.post("materials/types", {
      data: {
        name: generateRandomName("Hook Material"),
        categoryId,
        description: "Test Material Type",
        pricePerDay: 100,
      },
    });
    const typeBody = await typeRes.json();
    materialTypeId = typeBody.data.materialType._id;

    // 3. Create two locations with capacity for this material type
    const loc1Res = await request.post("locations", {
      data: {
        name: generateRandomName("Hook Warehouse 1"),
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
            maxQuantity: 10,
          },
        ],
      },
    });
    const loc1Body = await loc1Res.json();
    locationId = loc1Body.data._id;

    const loc2Res = await request.post("locations", {
      data: {
        name: generateRandomName("Hook Warehouse 2"),
        address: {
          streetType: "Calle",
          primaryNumber: "20",
          secondaryNumber: "22",
          complementaryNumber: "5",
          department: "Antioquia",
          city: "Medellín",
        },
        materialCapacities: [
          {
            materialTypeId: materialTypeId,
            maxQuantity: 10,
          },
        ],
      },
    });
    const loc2Body = await loc2Res.json();
    otherLocationId = loc2Body.data._id;
  });

  test("Should increment currentQuantity on creation", async ({ request }) => {
    // 1. Create instance
    const res = await request.post("materials/instances", {
      data: {
        modelId: materialTypeId,
        serialNumber: generateRandomSerial("SN-HOOK-1"),
        locationId: locationId,
      },
    });
    expect(res.status()).toBe(201);

    // 2. Verify location currentQuantity is 1
    const locRes = await request.get(`locations/${locationId}`);
    const locBody = await locRes.json();
    const capacity = locBody.data.materialCapacities.find(
      (c: any) => c.materialTypeId === materialTypeId,
    );
    expect(capacity.currentQuantity).toBe(1);
  });

  test("Should handle status change to 'retired' correctly", async ({
    request,
  }) => {
    // 1. Create instance in loc1
    const resCreate = await request.post("materials/instances", {
      data: {
        modelId: materialTypeId,
        serialNumber: generateRandomSerial("SN-HOOK-2"),
        locationId: locationId,
      },
    });
    expect(resCreate.status()).toBe(201);
    const instanceBody = await resCreate.json();
    const instanceId = instanceBody.data.instance._id;

    // Verify loc1 has 2 (from previous test + this one)
    const loc1ResBefore = await request.get(`locations/${locationId}`);
    const loc1BodyBefore = await loc1ResBefore.json();
    const cap1Before = loc1BodyBefore.data.materialCapacities.find(
      (c: any) => c.materialTypeId === materialTypeId,
    );
    const initialLoc1Qty = cap1Before.currentQuantity;

    // 2. PATCH status to 'retired'
    const resPatch = await request.patch(
      `materials/instances/${instanceId}/status`,
      {
        data: {
          status: "retired",
          notes: "Testing retired decrement",
        },
      },
    );
    expect(resPatch.status()).toBe(200);

    // 3. Verify loc1 decremented
    const loc1ResAfter = await request.get(`locations/${locationId}`);
    const loc1BodyAfter = await loc1ResAfter.json();
    const cap1After = loc1BodyAfter.data.materialCapacities.find(
      (c: any) => c.materialTypeId === materialTypeId,
    );
    expect(cap1After.currentQuantity).toBe(initialLoc1Qty - 1);
  });
});
