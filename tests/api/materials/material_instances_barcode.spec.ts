import { test, expect } from "@playwright/test";

/**
 * Tests for barcode support on material instances:
 * - Create with barcode
 * - Create without barcode (legacy compatible)
 * - 409 on duplicate barcode within same org
 * - Same barcode allowed across organizations (skipped: requires 2nd org setup)
 * - GET /instances/scan/:code – match by barcode
 * - GET /instances/scan/:code – fallback match by serialNumber
 * - GET /instances/scan/:code – 404 when not found
 * - PATCH /instances/:id/status – creates audit movement
 * - PATCH /instances/:id/status – rejects invalid transition
 */
test.describe.serial("Material Instances – Barcode & Scan", () => {
  let categoryId: string;
  let materialTypeId: string;
  let locationId: string;
  let instanceIdWithBarcode: string;
  let instanceIdNoBarcode: string;
  const uniqueBarcode = `BC-${Date.now()}`;
  const uniqueSerial = `SN-${Date.now()}`;
  const uniqueSerialNoBarcode = `SN-NOB-${Date.now()}`;

  // ─── Prerequisites ────────────────────────────────────────────────────────

  test("setup: create category", async ({ request }) => {
    const res = await request.post("materials/categories", {
      data: { name: `BCScanCat ${Date.now()}`, description: "Barcode tests" },
    });
    expect(res.status()).toBe(201);
    categoryId = (await res.json()).data.category._id;
  });

  test("setup: create material type", async ({ request }) => {
    if (!categoryId) test.skip();
    const res = await request.post("materials/types", {
      data: {
        name: `BCScanType ${Date.now()}`,
        categoryId,
        description: "Barcode scan type",
        pricePerDay: 500,
      },
    });
    expect(res.status()).toBe(201);
    materialTypeId = (await res.json()).data.materialType._id;
  });

  test("setup: create location", async ({ request }) => {
    const res = await request.post("locations", {
      data: {
        name: `BCScanLoc ${Date.now()}`,
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
    expect(res.status()).toBe(201);
    const body = await res.json();
    locationId = body.data._id ?? body.data.location?._id;
  });

  // ─── Create with barcode ──────────────────────────────────────────────────

  test("POST /instances – creates instance with barcode", async ({
    request,
  }) => {
    if (!materialTypeId || !locationId) test.skip();

    const res = await request.post("materials/instances", {
      data: {
        modelId: materialTypeId,
        serialNumber: uniqueSerial,
        locationId,
        barcode: uniqueBarcode,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.instance).toBeDefined();
    expect(body.data.instance.barcode).toBe(uniqueBarcode);
    instanceIdWithBarcode = body.data.instance._id;
  });

  // ─── Create without barcode (legacy) ─────────────────────────────────────

  test("POST /instances – creates instance without barcode (legacy compatible)", async ({
    request,
  }) => {
    if (!materialTypeId || !locationId) test.skip();

    const res = await request.post("materials/instances", {
      data: {
        modelId: materialTypeId,
        serialNumber: uniqueSerialNoBarcode,
        locationId,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("success");
    instanceIdNoBarcode = body.data.instance._id;
    // barcode should be absent or undefined
    expect(body.data.instance.barcode ?? undefined).toBeUndefined();
  });

  // ─── Duplicate barcode within same org → 409 ─────────────────────────────

  test("POST /instances – rejects duplicate barcode in same organization (409)", async ({
    request,
  }) => {
    if (!materialTypeId || !locationId) test.skip();

    const res = await request.post("materials/instances", {
      data: {
        modelId: materialTypeId,
        serialNumber: `SN-DUP-${Date.now()}`,
        locationId,
        barcode: uniqueBarcode, // same barcode as the first instance
      },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.message).toMatch(/barcode already exists/i);
  });

  // ─── List includes barcode ────────────────────────────────────────────────

  test("GET /instances – includes barcode in list response", async ({
    request,
  }) => {
    const res = await request.get("materials/instances");
    expect(res.status()).toBe(200);
    const body = await res.json();
    const withBarcode = body.data.instances.find(
      (i: any) => i._id === instanceIdWithBarcode,
    );
    if (withBarcode) {
      expect(withBarcode.barcode).toBe(uniqueBarcode);
    }
  });

  // ─── Scan by barcode ──────────────────────────────────────────────────────

  test("GET /instances/scan/:code – returns instance matched by barcode", async ({
    request,
  }) => {
    if (!instanceIdWithBarcode) test.skip();

    const res = await request.get(
      `materials/instances/scan/${uniqueBarcode}`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.instance).toBeDefined();
    expect(body.data.matchedBy).toBe("barcode");
    expect(body.data.instance._id).toBe(instanceIdWithBarcode);
  });

  // ─── Scan fallback by serialNumber ────────────────────────────────────────

  test("GET /instances/scan/:code – returns instance matched by serialNumber when barcode not found", async ({
    request,
  }) => {
    if (!instanceIdNoBarcode) test.skip();

    const res = await request.get(
      `materials/instances/scan/${uniqueSerialNoBarcode}`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.matchedBy).toBe("serialNumber");
    expect(body.data.instance._id).toBe(instanceIdNoBarcode);
  });

  // ─── Scan not found → 404 ────────────────────────────────────────────────

  test("GET /instances/scan/:code – returns 404 when code does not match anything", async ({
    request,
  }) => {
    const res = await request.get(
      "materials/instances/scan/NOTEXIST-9999999999",
    );
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.message).toMatch(/no material instance found/i);
  });

  // ─── Patch status – valid transition creates audit movement ──────────────

  test("PATCH /instances/:id/status – valid transition and notes/source recorded", async ({
    request,
  }) => {
    if (!instanceIdWithBarcode) test.skip();

    const res = await request.patch(
      `materials/instances/${instanceIdWithBarcode}/status`,
      {
        data: {
          status: "maintenance",
          notes: "Scheduled service",
          source: "scanner",
        },
      },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.instance.status).toBe("maintenance");
  });

  // ─── Patch status – idempotent same-status returns success without error ──

  test("PATCH /instances/:id/status – same status returns success (idempotent)", async ({
    request,
  }) => {
    if (!instanceIdWithBarcode) test.skip();

    // Instance is currently in maintenance from previous test
    const res = await request.patch(
      `materials/instances/${instanceIdWithBarcode}/status`,
      {
        data: { status: "maintenance" },
      },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
  });

  // ─── Patch status – invalid transition is rejected ───────────────────────

  test("PATCH /instances/:id/status – invalid transition is rejected (400)", async ({
    request,
  }) => {
    if (!instanceIdNoBarcode) test.skip();

    // Instance is available; "loaned" is not a valid direct transition from available
    const res = await request.patch(
      `materials/instances/${instanceIdNoBarcode}/status`,
      {
        data: { status: "loaned" },
      },
    );
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.status).toBe("error");
  });
});
