import { test, expect, type APIRequestContext } from "@playwright/test";
import { createAndLoginUser } from "../../utils/setup.ts";
import {
  generateRandomEmail,
  generateRandomPhone,
} from "../../utils/helpers.ts";

test.describe("Customers Module", () => {
  let apiContext: APIRequestContext;

  test.beforeAll(async ({ baseURL }) => {
    const setup = await createAndLoginUser(baseURL!);
    apiContext = setup.apiContext;
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test("POST /customers - should create and then list customer", async () => {
    const idNumber = `${Math.floor(Math.random() * 100000000)}`;
    const customerData = {
      name: { firstName: "Cust", firstSurname: "Omer" },
      email: generateRandomEmail(),
      phone: generateRandomPhone(),
      idType: "CC",
      idNumber: idNumber,
      address: { street: "Main St", city: "Medellín", country: "Colombia" },
    };

    // Create
    const createRes = await apiContext.post("/customers", {
      data: customerData,
    });
    expect(createRes.status()).toBe(201);

    // List
    const listRes = await apiContext.get("/customers");
    expect(listRes.status()).toBe(200);
    const body = await listRes.json();
    const found = body.data.customers.find((c: any) => c.idNumber === idNumber);
    expect(found).toBeDefined();
  });

  // Additional tests: GET /:id, PATCH /:id, POST /:id/blacklist
});
