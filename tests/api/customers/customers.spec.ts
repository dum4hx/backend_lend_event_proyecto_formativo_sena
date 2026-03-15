import { test, expect } from "@playwright/test";
import {
  generateRandomEmail,
  generateRandomPhone,
} from "../../utils/helpers.ts";

test.describe("Customers Module", () => {
  test("POST /customers - should create and then list customer", async ({
    request,
  }) => {
    const documentNumber = `${Math.floor(Math.random() * 100000000)}`;
    const customerData = {
      name: { firstName: "Cust", firstSurname: "Omer" },
      email: generateRandomEmail(),
      phone: generateRandomPhone(),
      documentType: "cc",
      documentNumber: documentNumber,
      address: { street: "Main St", city: "Medellín", country: "Colombia" },
    };

    // Create
    const createRes = await request.post("customers", {
      data: customerData,
    });
    expect(createRes.status()).toBe(201);

    // List
    const listRes = await request.get("customers");
    expect(listRes.status()).toBe(200);
    const body = await listRes.json();
    const found = body.data.customers.find(
      (c: any) => c.documentNumber === documentNumber,
    );
    expect(found).toBeDefined();
  });

  // Additional tests: GET /:id, PATCH /:id, POST /:id/blacklist
});
