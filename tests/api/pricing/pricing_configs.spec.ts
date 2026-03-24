import { test, expect } from "@playwright/test";

test.describe.serial("Pricing Configurations Module", () => {
  let materialTypeId: string;
  let configId: string;

  // Create a material type to use as referenceId for item-scoped configs
  test("setup: create a material type for pricing tests", async ({
    request,
  }) => {
    const catRes = await request.post("materials/categories", {
      data: {
        name: `PricingCat ${Date.now()}`,
        description: "Cat for pricing tests",
      },
    });
    const catBody = await catRes.json();
    const categoryId = catBody.data?.category?._id as string;

    const matRes = await request.post("materials/types", {
      data: {
        name: `PricingMat ${Date.now()}`,
        categoryId,
        description: "Material for pricing tests",
        pricePerDay: 100,
      },
    });
    expect(matRes.status()).toBe(201);
    const matBody = await matRes.json();
    materialTypeId = matBody.data.materialType._id as string;
  });

  // ------------------------------------------------------------------
  // GET /pricing/configs — list
  // ------------------------------------------------------------------

  test("GET /pricing/configs - should return org-default config seeded at registration", async ({
    request,
  }) => {
    const res = await request.get("pricing/configs");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(Array.isArray(body.data)).toBe(true);
    // At minimum the org-level default config seeded on registration must exist
    const hasOrgDefault = body.data.some(
      (c: { scope: string }) => c.scope === "organization",
    );
    expect(hasOrgDefault).toBe(true);
  });

  // ------------------------------------------------------------------
  // POST /pricing/configs — create
  // ------------------------------------------------------------------

  test("POST /pricing/configs - should create a per_day config for a material type", async ({
    request,
  }) => {
    if (!materialTypeId) test.skip();
    const res = await request.post("pricing/configs", {
      data: {
        scope: "materialType",
        referenceId: materialTypeId,
        strategyType: "per_day",
        name: "Per Day Override",
        perDayParams: { overridePricePerDay: 200 },
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.strategyType).toBe("per_day");
    expect(body.data.scope).toBe("materialType");
    configId = body.data._id as string;
  });

  test("POST /pricing/configs - should return 409 on duplicate (scope, referenceId)", async ({
    request,
  }) => {
    if (!materialTypeId) test.skip();
    const res = await request.post("pricing/configs", {
      data: {
        scope: "materialType",
        referenceId: materialTypeId,
        strategyType: "per_day",
        name: "Duplicate",
      },
    });
    expect(res.status()).toBe(409);
  });

  test("POST /pricing/configs - should return 400 when fixed strategy missing flatPrice", async ({
    request,
  }) => {
    const res = await request.post("pricing/configs", {
      data: {
        scope: "materialType",
        referenceId: materialTypeId,
        strategyType: "fixed",
        name: "Bad Fixed",
        // fixedParams intentionally omitted
      },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /pricing/configs - should return 400 when weekly_monthly strategy missing prices", async ({
    request,
  }) => {
    const res = await request.post("pricing/configs", {
      data: {
        scope: "materialType",
        referenceId: materialTypeId,
        strategyType: "weekly_monthly",
        name: "Bad Weekly",
        weeklyMonthlyParams: {
          // Neither weeklyPrice nor monthlyPrice provided
          weeklyThreshold: 7,
          monthlyThreshold: 30,
        },
      },
    });
    expect(res.status()).toBe(400);
  });

  // ------------------------------------------------------------------
  // GET /pricing/configs/:id — get by id
  // ------------------------------------------------------------------

  test("GET /pricing/configs/:id - should return the config", async ({
    request,
  }) => {
    if (!configId) test.skip();
    const res = await request.get(`pricing/configs/${configId}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data._id).toBe(configId);
  });

  test("GET /pricing/configs/:id - should return 404 for unknown id", async ({
    request,
  }) => {
    const res = await request.get("pricing/configs/000000000000000000000099");
    expect(res.status()).toBe(404);
  });

  // ------------------------------------------------------------------
  // PUT /pricing/configs/:id — update
  // ------------------------------------------------------------------

  test("PUT /pricing/configs/:id - should update the config params", async ({
    request,
  }) => {
    if (!configId) test.skip();
    const res = await request.put(`pricing/configs/${configId}`, {
      data: {
        perDayParams: { overridePricePerDay: 250 },
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.perDayParams?.overridePricePerDay).toBe(250);
  });

  // ------------------------------------------------------------------
  // DELETE /pricing/configs/:id — delete
  // ------------------------------------------------------------------

  test("DELETE /pricing/configs/:id - should delete the item-scoped config", async ({
    request,
  }) => {
    if (!configId) test.skip();
    const res = await request.delete(`pricing/configs/${configId}`);
    expect(res.status()).toBe(200);
  });

  test("DELETE /pricing/configs/:id - should return 400 when deleting org-default config", async ({
    request,
  }) => {
    // First fetch the org-level config id
    const listRes = await request.get("pricing/configs");
    const configs: Array<{ _id: string; scope: string }> = (
      await listRes.json()
    ).data;
    const orgDefault = configs.find((c) => c.scope === "organization");
    if (!orgDefault) test.skip();

    const res = await request.delete(`pricing/configs/${orgDefault!._id}`);
    expect(res.status()).toBe(400);
  });
});
