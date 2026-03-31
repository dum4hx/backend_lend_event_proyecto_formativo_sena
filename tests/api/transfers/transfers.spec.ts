import { test, expect } from "@playwright/test";

test.describe("Transfers Module", () => {
  test.describe.configure({ mode: "serial" });

  let fromLocationId: string;
  let toLocationId: string;
  let materialInstanceId: string;
  let modelId: string;
  let transferRequestId: string;
  let transferId: string;

  test.beforeAll(async ({ request }) => {
    // 1. Create two locations
    const loc1Res = await request.post("/api/v1/locations", {
      data: {
        name: `From Location ${Date.now()}`,
        address: {
          streetType: "Calle",
          primaryNumber: "1",
          secondaryNumber: "23",
          complementaryNumber: "10",
          department: "Cundinamarca",
          city: "Bogotá",
        },
      },
    });
    const loc1 = await loc1Res.json();
    fromLocationId = loc1.data._id;

    const loc2Res = await request.post("/api/v1/locations", {
      data: {
        name: `To Location ${Date.now()}`,
        address: {
          streetType: "Calle",
          primaryNumber: "2",
          secondaryNumber: "45",
          complementaryNumber: "6",
          department: "Antioquia",
          city: "Medellín",
        },
      },
    });
    const loc2 = await loc2Res.json();
    toLocationId = loc2.data._id;

    // 2. Create a material category
    const categoryRes = await request.post("/api/v1/materials/categories", {
      data: {
        name: `Transfer Test Category ${Date.now()}`,
        description: "Category for transfer tests",
      },
    });
    const categoryBody = await categoryRes.json();
    const categoryId = categoryBody.data.category._id;

    // 3. Create a material type (serves as the model)
    const typeRes = await request.post("/api/v1/materials/types", {
      data: {
        name: `Transfer Test Type ${Date.now()}`,
        description: "Test type for transfers",
        categoryId: [categoryId],
        pricePerDay: 1000,
      },
    });
    const type = await typeRes.json();
    modelId = type.data.materialType._id;

    // 4. Create a material instance at the origin location
    const instanceRes = await request.post("/api/v1/materials/instances", {
      data: {
        modelId,
        serialNumber: `SN-${Date.now()}`,
        locationId: fromLocationId,
      },
    });
    const instance = await instanceRes.json();
    materialInstanceId = instance.data.instance._id;
  });

  test("POST /requests - should create a transfer request", async ({
    request,
  }) => {
    const response = await request.post("/api/v1/transfers/requests", {
      data: {
        fromLocationId,
        toLocationId,
        items: [{ modelId, quantity: 1 }],
        notes: "Request for testing",
      },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.data.fromLocationId).toBe(fromLocationId);
    expect(body.data.status).toBe("requested");
    transferRequestId = body.data._id;
  });

  test("PATCH /requests/:id/respond - should approve request", async ({
    request,
  }) => {
    const response = await request.patch(
      `/api/v1/transfers/requests/${transferRequestId}/respond`,
      {
        data: { status: "approved" },
      },
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("approved");
  });

  test("POST /transfers - should initiate a transfer", async ({ request }) => {
    const response = await request.post("/api/v1/transfers", {
      data: {
        requestId: transferRequestId,
        fromLocationId,
        toLocationId,
        items: [{ instanceId: materialInstanceId, notes: "Item 1" }],
        senderNotes: "Sending items now",
      },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.data.status).toBe("in_transit");
    transferId = body.data._id;

    // Verify instance status is changed (in this case 'in_use' as implemented in service)
    const instRes = await request.get(
      `/api/v1/materials/instances/${materialInstanceId}`,
    );
    const instData = await instRes.json();
    expect(instData.data.instance.status).toBe("in_use");
  });

  test("PATCH /transfers/:id/receive - should receive a transfer", async ({
    request,
  }) => {
    const response = await request.patch(
      `/api/v1/transfers/${transferId}/receive`,
      {
        data: { receiverNotes: "Everything received correctly" },
      },
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("received");

    // Verify instance location and status
    const instRes = await request.get(
      `/api/v1/materials/instances/${materialInstanceId}`,
    );
    const instData = await instRes.json();
    expect(instData.data.instance.locationId).toBe(toLocationId);
    expect(instData.data.instance.status).toBe("available");
  });

  test("GET /transfers - should list transfers", async ({ request }) => {
    const response = await request.get("/api/v1/transfers");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  test("PATCH /requests/:id/respond - should approve request with location access", async ({
    request,
  }) => {
    // Note: This test uses the authenticated user who created the locations in beforeAll.
    // Since location creators are auto-assigned to their locations, this user has access
    // to the source location and can approve.
    // Full location-based authorization testing requires multi-user test infrastructure.

    const newReqRes = await request.post("/api/v1/transfers/requests", {
      data: {
        fromLocationId,
        toLocationId,
        items: [{ modelId, quantity: 1 }],
        notes: "Testing location-based approval",
      },
    });
    expect(newReqRes.status()).toBe(201);
    const newReq = await newReqRes.json();
    const newRequestId = newReq.data._id;

    const respondRes = await request.patch(
      `/api/v1/transfers/requests/${newRequestId}/respond`,
      {
        data: { status: "approved" },
      },
    );
    // User who created the location has access and can approve
    expect(respondRes.status()).toBe(200);
    const respondData = await respondRes.json();
    expect(respondData.data.status).toBe("approved");
  });
});
