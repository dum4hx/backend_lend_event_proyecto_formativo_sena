import { test, expect, type APIRequestContext } from "@playwright/test";
import { createAndLoginUser } from "../../utils/setup.ts";

test.describe("Materials Module", () => {
  let apiContext: APIRequestContext;
  let categoryId: string;
  let materialTypeId: string;

  test.beforeAll(async ({ baseURL }) => {
    const setup = await createAndLoginUser(baseURL!);
    apiContext = setup.apiContext;
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test("POST /materials/categories - should create category", async () => {
    const res = await apiContext.post("/materials/categories", {
      data: { name: `Cameras ${Date.now()}`, description: "Test Cat" },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    categoryId = body.data.category.id;
  });

  test("GET /materials/categories - should list categories", async () => {
    const res = await apiContext.get("/materials/categories");
    expect(res.status()).toBe(200);
  });

  // Dependent on category
  test("POST /materials/types - should create material type", async () => {
    if (!categoryId) test.skip();
    const res = await apiContext.post("/materials/types", {
      data: {
        name: `Canon ${Date.now()}`,
        sku: `CAM-${Date.now()}`,
        categoryId,
        description: "Desc",
        pricePerDay: 1000,
        replacementValue: 50000,
        specifications: { sensor: "CMOS" },
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    materialTypeId = body.data.materialType.id;
  });

  // Dependent on type
  test("POST /materials/instances - should create instance", async () => {
    if (!materialTypeId) test.skip();
    const res = await apiContext.post("/materials/instances", {
      data: {
        materialTypeId,
        serialNumber: `SN-${Date.now()}`,
        locationId: "LOC-001", // Assuming string or mocked
        purchaseDate: "2024-01-01",
        purchasePrice: 10000,
      },
    });
    expect(res.status()).toBe(201);
  });

  // GET /materials/types, GET /materials/instances, PATCH /instances/:id/status
});
