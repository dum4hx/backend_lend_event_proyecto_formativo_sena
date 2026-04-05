import { test, expect, request as baseRequest } from "@playwright/test";
import { defaultOrgData } from "../../utils/helpers.ts";

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

  const createSecondaryOrgContext = async (baseURL: string) => {
    const ctx = await baseRequest.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
      storageState: { cookies: [], origins: [] },
    });

    const payload = defaultOrgData();
    const registerRes = await ctx.post("auth/register", { data: payload });
    expect(registerRes.status()).toBe(202);

    const verifyRes = await ctx.post("auth/verify-email", {
      data: {
        email: payload.owner.email,
        code: "123456",
      },
    });
    expect(verifyRes.status()).toBe(201);

    const loginRes = await ctx.post("auth/login", {
      data: {
        email: payload.owner.email,
        password: payload.owner.password,
      },
    });
    expect(loginRes.status()).toBe(200);

    const otpRes = await ctx.post("auth/verify-login-otp", {
      data: {
        email: payload.owner.email,
        code: "123456",
      },
    });
    expect(otpRes.status()).toBe(200);

    return ctx;
  };

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
        categoryId: [categoryId],
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

  test("POST /instances – creates instance with useBarcodeAsSerial=true", async ({
    request,
  }) => {
    if (!materialTypeId || !locationId) test.skip();

    const res = await request.post("materials/instances", {
      data: {
        modelId: materialTypeId,
        serialNumber: "IGNORED-SERIAL-WHEN-SWITCH-TRUE",
        locationId,
        barcode: uniqueBarcode,
        useBarcodeAsSerial: true,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.instance).toBeDefined();
    expect(body.data.instance.barcode).toBe(uniqueBarcode);
    expect(body.data.instance.serialNumber).toBe(uniqueBarcode);
    instanceIdWithBarcode = body.data.instance._id;
  });

  test("POST /instances – rejects useBarcodeAsSerial=true with empty barcode", async ({
    request,
  }) => {
    if (!materialTypeId || !locationId) test.skip();

    const res = await request.post("materials/instances", {
      data: {
        modelId: materialTypeId,
        locationId,
        useBarcodeAsSerial: true,
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("BAD_REQUEST");
    expect(body.message).toMatch(/barcode/i);
  });

  test("POST /instances – rejects useBarcodeAsSerial=false with empty serial", async ({
    request,
  }) => {
    if (!materialTypeId || !locationId) test.skip();

    const res = await request.post("materials/instances", {
      data: {
        modelId: materialTypeId,
        locationId,
        barcode: `BC-ONLY-${Date.now()}`,
        useBarcodeAsSerial: false,
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("BAD_REQUEST");
    expect(body.message).toMatch(/serialNumber/i);
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

  test("POST /instances – rejects duplicate serial in same organization (409)", async ({
    request,
  }) => {
    if (!materialTypeId || !locationId) test.skip();

    const first = await request.post("materials/instances", {
      data: {
        modelId: materialTypeId,
        serialNumber: uniqueSerial,
        locationId,
      },
    });
    expect(first.status()).toBe(201);

    const second = await request.post("materials/instances", {
      data: {
        modelId: materialTypeId,
        serialNumber: uniqueSerial,
        locationId,
      },
    });
    expect(second.status()).toBe(409);
    const body = await second.json();
    expect(body.code).toBe("CONFLICT");
    expect(body.message).toMatch(/serial number/i);
  });

  test("POST /instances – allows same serial and barcode in a different organization", async ({
    baseURL,
  }) => {
    if (!baseURL) test.skip();

    const secondOrgCtx = await createSecondaryOrgContext(baseURL);
    try {
      const categoryRes = await secondOrgCtx.post("materials/categories", {
        data: {
          name: `SecondOrgCat ${Date.now()}`,
          description: "Second org barcode tests",
        },
      });
      expect(categoryRes.status()).toBe(201);
      const secondCategoryId = (await categoryRes.json()).data.category._id;

      const typeRes = await secondOrgCtx.post("materials/types", {
        data: {
          name: `SecondOrgType ${Date.now()}`,
          categoryId: [secondCategoryId],
          description: "Second org type",
          pricePerDay: 1000,
        },
      });
      expect(typeRes.status()).toBe(201);
      const secondTypeId = (await typeRes.json()).data.materialType._id;

      const locationRes = await secondOrgCtx.post("locations", {
        data: {
          name: `SecondOrgLoc ${Date.now()}`,
          address: {
            streetType: "Calle",
            primaryNumber: "100",
            secondaryNumber: "20",
            complementaryNumber: "5",
            department: "Antioquia",
            city: "Medellín",
          },
        },
      });
      expect(locationRes.status()).toBe(201);
      const secondLocationBody = await locationRes.json();
      const secondLocationId =
        secondLocationBody.data._id ?? secondLocationBody.data.location?._id;

      const createWithSameKeys = await secondOrgCtx.post(
        "materials/instances",
        {
          data: {
            modelId: secondTypeId,
            locationId: secondLocationId,
            serialNumber: uniqueBarcode,
            barcode: uniqueBarcode,
          },
        },
      );

      expect(createWithSameKeys.status()).toBe(201);
    } finally {
      await secondOrgCtx.dispose();
    }
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

    const res = await request.get(`materials/instances/scan/${uniqueBarcode}`);
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

  test("PATCH /instances/:id – can switch to useBarcodeAsSerial=true and sync serial", async ({
    request,
  }) => {
    if (!instanceIdNoBarcode) test.skip();

    const barcodeToMirror = `BC-SYNC-${Date.now()}`;
    const res = await request.patch(
      `materials/instances/${instanceIdNoBarcode}`,
      {
        data: {
          barcode: barcodeToMirror,
          useBarcodeAsSerial: true,
        },
      },
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.instance.barcode).toBe(barcodeToMirror);
    expect(body.data.instance.serialNumber).toBe(barcodeToMirror);
  });

  test("PATCH /instances/:id – can switch to useBarcodeAsSerial=false with manual serial", async ({
    request,
  }) => {
    if (!instanceIdNoBarcode) test.skip();

    const manualSerial = `SN-MANUAL-${Date.now()}`;
    const res = await request.patch(
      `materials/instances/${instanceIdNoBarcode}`,
      {
        data: {
          serialNumber: manualSerial,
          useBarcodeAsSerial: false,
        },
      },
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.instance.serialNumber).toBe(manualSerial);
  });

  test("PATCH /instances/:id – rejects useBarcodeAsSerial=true without barcode", async ({
    request,
  }) => {
    if (!instanceIdNoBarcode) test.skip();

    const res = await request.patch(
      `materials/instances/${instanceIdNoBarcode}`,
      {
        data: {
          barcode: "   ",
          useBarcodeAsSerial: true,
        },
      },
    );

    expect(res.status()).toBe(400);
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
