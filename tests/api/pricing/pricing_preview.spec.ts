import { test, expect } from "@playwright/test";

test.describe.serial("Pricing Preview", () => {
  let materialTypeId: string;
  let packageId: string;

  // Create a material type and package to use in previews
  test("setup: create material type and package for preview tests", async ({
    request,
  }) => {
    const catRes = await request.post("materials/categories", {
      data: {
        name: `PreviewCat ${Date.now()}`,
        description: "Cat for preview tests",
      },
    });
    const catBody = await catRes.json();
    const categoryId = catBody.data?.category?._id as string;

    const matRes = await request.post("materials/types", {
      data: {
        name: `PreviewMat ${Date.now()}`,
        categoryId,
        description: "Material for preview tests",
        pricePerDay: 50,
      },
    });
    expect(matRes.status()).toBe(201);
    materialTypeId = (await matRes.json()).data.materialType._id as string;

    const pkgRes = await request.post("packages", {
      data: {
        name: `PreviewPkg ${Date.now()}`,
        description: "Package for preview tests",
        pricePerDay: 80,
        items: [{ materialTypeId, quantity: 1 }],
      },
    });
    // Package creation may not exist in all envs — tolerate non-201
    if (pkgRes.status() === 201) {
      packageId = (await pkgRes.json()).data._id as string;
    }
  });

  // ------------------------------------------------------------------
  // POST /pricing/preview — per_day strategy (uses org-default)
  // ------------------------------------------------------------------

  test("POST /pricing/preview - should return estimated price (per_day via org default)", async ({
    request,
  }) => {
    if (!materialTypeId) test.skip();
    const res = await request.post("pricing/preview", {
      data: {
        itemType: "materialType",
        referenceId: materialTypeId,
        quantity: 2,
        durationInDays: 5,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.strategyType).toBe("per_day");
    expect(body.data.totalPrice).toBeGreaterThan(0);
    expect(body.data.quantity).toBe(2);
    expect(body.data.durationInDays).toBe(5);
  });

  // ------------------------------------------------------------------
  // POST /pricing/preview — weekly_monthly strategy (custom config)
  // ------------------------------------------------------------------

  test("POST /pricing/preview - should return weekly price when duration >= weeklyThreshold", async ({
    request,
  }) => {
    if (!materialTypeId) test.skip();

    // Create a weekly_monthly config for this material type
    const confRes = await request.post("pricing/configs", {
      data: {
        scope: "materialType",
        referenceId: materialTypeId,
        strategyType: "weekly_monthly",
        name: "Weekly Preview Config",
        weeklyMonthlyParams: {
          weeklyPrice: 200,
          weeklyThreshold: 7,
          monthlyPrice: 600,
          monthlyThreshold: 30,
        },
      },
    });
    expect(confRes.status()).toBe(201);
    const confId: string = (await confRes.json()).data._id;

    const previewRes = await request.post("pricing/preview", {
      data: {
        itemType: "materialType",
        referenceId: materialTypeId,
        quantity: 1,
        durationInDays: 7,
      },
    });
    expect(previewRes.status()).toBe(200);
    const body = await previewRes.json();
    expect(body.data.strategyType).toBe("weekly_monthly");
    // Exactly 1 week => 1 × weeklyPrice = 200
    expect(body.data.totalPrice).toBe(200);

    // Clean up config
    await request.delete(`pricing/configs/${confId}`);
  });

  // ------------------------------------------------------------------
  // POST /pricing/preview — fixed strategy
  // ------------------------------------------------------------------

  test("POST /pricing/preview - should return flat price for fixed strategy", async ({
    request,
  }) => {
    if (!materialTypeId) test.skip();

    // Create a fixed config for this material type
    const confRes = await request.post("pricing/configs", {
      data: {
        scope: "materialType",
        referenceId: materialTypeId,
        strategyType: "fixed",
        name: "Fixed Preview Config",
        fixedParams: { flatPrice: 999 },
      },
    });
    expect(confRes.status()).toBe(201);
    const confId: string = (await confRes.json()).data._id;

    const previewRes = await request.post("pricing/preview", {
      data: {
        itemType: "materialType",
        referenceId: materialTypeId,
        quantity: 3,
        durationInDays: 10,
      },
    });
    expect(previewRes.status()).toBe(200);
    const body = await previewRes.json();
    expect(body.data.strategyType).toBe("fixed");
    // fixed: flatPrice × quantity = 999 × 3 = 2997
    expect(body.data.totalPrice).toBe(2997);

    // Clean up
    await request.delete(`pricing/configs/${confId}`);
  });

  // ------------------------------------------------------------------
  // Validation errors
  // ------------------------------------------------------------------

  test("POST /pricing/preview - should return 400 when referenceId is missing", async ({
    request,
  }) => {
    const res = await request.post("pricing/preview", {
      data: {
        itemType: "materialType",
        // referenceId omitted
        quantity: 1,
        durationInDays: 5,
      },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /pricing/preview - should return 400 when durationInDays is zero", async ({
    request,
  }) => {
    if (!materialTypeId) test.skip();
    const res = await request.post("pricing/preview", {
      data: {
        itemType: "materialType",
        referenceId: materialTypeId,
        quantity: 1,
        durationInDays: 0,
      },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /pricing/preview - should return 404 for unknown referenceId", async ({
    request,
  }) => {
    const res = await request.post("pricing/preview", {
      data: {
        itemType: "materialType",
        referenceId: "000000000000000000000099",
        quantity: 1,
        durationInDays: 5,
      },
    });
    expect(res.status()).toBe(404);
  });
});
