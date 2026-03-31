import { test, expect } from "@playwright/test";
import { generateRandomName } from "../../utils/helpers.ts";

test.describe.serial("Packages Module", () => {
  let materialTypeId: string;
  let packageId: string;

  /* ---------- Setup: create a material type so packages have a valid item ---------- */

  test("Setup: create category and material type", async ({ request }) => {
    // Category
    const catRes = await request.post("materials/categories", {
      data: {
        name: generateRandomName("PkgCat"),
        description: "Category for package tests",
      },
    });
    expect(catRes.status()).toBe(201);
    const catBody = await catRes.json();
    const categoryId = catBody.data.category._id;

    // Material type
    const typeRes = await request.post("materials/types", {
      data: {
        name: generateRandomName("PkgType"),
        categoryId: [categoryId],
        description: "Type for package tests",
        pricePerDay: 500,
      },
    });
    expect(typeRes.status()).toBe(201);
    materialTypeId = (await typeRes.json()).data.materialType._id;
  });

  /* ===================== CRUD ===================== */

  test("POST /packages - should create a package", async ({ request }) => {
    if (!materialTypeId) test.skip();

    const res = await request.post("packages", {
      data: {
        name: generateRandomName("TestPkg"),
        description: "A test package",
        items: [{ materialTypeId, quantity: 2 }],
        pricePerDay: 1500,
        discountRate: 0.1,
        depositAmount: 5000,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.package).toBeDefined();
    expect(body.data.package.items).toHaveLength(1);
    packageId = body.data.package._id;
  });

  test("POST /packages - should reject missing items", async ({ request }) => {
    const res = await request.post("packages", {
      data: {
        name: generateRandomName("BadPkg"),
        pricePerDay: 100,
        items: [],
      },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /packages - should reject missing name", async ({ request }) => {
    if (!materialTypeId) test.skip();
    const res = await request.post("packages", {
      data: {
        items: [{ materialTypeId, quantity: 1 }],
        pricePerDay: 100,
      },
    });
    expect(res.status()).toBe(400);
  });

  test("GET /packages - should list packages", async ({ request }) => {
    const res = await request.get("packages");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(Array.isArray(body.data.packages)).toBe(true);
    expect(typeof body.data.total).toBe("number");
  });

  test("GET /packages - should filter by isActive", async ({ request }) => {
    const res = await request.get("packages?isActive=true");
    expect(res.status()).toBe(200);
  });

  test("GET /packages - should search by name", async ({ request }) => {
    const res = await request.get("packages?search=TestPkg");
    expect(res.status()).toBe(200);
  });

  test("GET /packages/:id - should return a package", async ({ request }) => {
    if (!packageId) test.skip();
    const res = await request.get(`packages/${packageId}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.package._id).toBe(packageId);
    expect(body.data.package.items).toBeDefined();
  });

  test("GET /packages/:id - should return 404 for nonexistent", async ({
    request,
  }) => {
    const res = await request.get("packages/000000000000000000000000");
    expect(res.status()).toBe(404);
  });

  test("PATCH /packages/:id - should update a package", async ({ request }) => {
    if (!packageId) test.skip();
    const res = await request.patch(`packages/${packageId}`, {
      data: { description: "Updated desc", discountRate: 0.15 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.package.description).toBe("Updated desc");
    expect(body.data.package.discountRate).toBe(0.15);
  });

  /* =============== ACTIVATE / DEACTIVATE =============== */

  test("POST /packages/:id/deactivate - should deactivate", async ({
    request,
  }) => {
    if (!packageId) test.skip();
    const res = await request.post(`packages/${packageId}/deactivate`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.package.isActive).toBe(false);
  });

  test("POST /packages/:id/activate - should activate", async ({ request }) => {
    if (!packageId) test.skip();
    const res = await request.post(`packages/${packageId}/activate`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.package.isActive).toBe(true);
  });

  /* =============== DELETE =============== */

  test("DELETE /packages/:id - should delete a package", async ({
    request,
  }) => {
    if (!packageId) test.skip();
    const res = await request.delete(`packages/${packageId}`);
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe("success");

    // Verify it's gone
    const getRes = await request.get(`packages/${packageId}`);
    expect(getRes.status()).toBe(404);
  });

  test("DELETE /packages/:id - should return 404 for nonexistent", async ({
    request,
  }) => {
    const res = await request.delete("packages/000000000000000000000000");
    expect(res.status()).toBe(404);
  });
});
