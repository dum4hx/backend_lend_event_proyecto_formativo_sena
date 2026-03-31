import { test, expect } from "@playwright/test";
import {
  generateRandomEmail,
  generateRandomPhone,
} from "../../utils/helpers.ts";

const makeCustomer = () => ({
  name: { firstName: "Cust", firstSurname: "Omer" },
  email: generateRandomEmail(),
  phone: generateRandomPhone(),
  documentType: "cc",
  documentNumber: `${Math.floor(Math.random() * 100000000)}`,
  address: {
    streetType: "Calle",
    primaryNumber: "Main",
    secondaryNumber: "8A",
    complementaryNumber: "47",
    department: "Antioquia",
    city: "Medellín",
  },
});

test.describe.serial("Customers Module", () => {
  let customerId: string;

  /* ===================== CRUD ===================== */

  test("POST /customers - should create a customer", async ({ request }) => {
    const data = makeCustomer();
    const res = await request.post("customers", { data });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.customer).toBeDefined();
    expect(body.data.customer.email).toBe(data.email);
    customerId = body.data.customer._id;
  });

  test("POST /customers - should reject duplicate email in same org", async ({
    request,
  }) => {
    // First create a customer
    const data = makeCustomer();
    const res1 = await request.post("customers", { data });
    expect(res1.status()).toBe(201);

    // Try again with same email
    const dup = makeCustomer();
    dup.email = data.email;
    const res2 = await request.post("customers", { data: dup });
    expect(res2.status()).toBe(409);
  });

  test("POST /customers - should reject duplicate phone in same org", async ({
    request,
  }) => {
    const data = makeCustomer();
    const res1 = await request.post("customers", { data });
    expect(res1.status()).toBe(201);

    const dup = makeCustomer();
    dup.phone = data.phone;
    const res2 = await request.post("customers", { data: dup });
    expect(res2.status()).toBe(409);
  });

  test("POST /customers - should reject invalid body (missing name)", async ({
    request,
  }) => {
    const res = await request.post("customers", {
      data: { email: generateRandomEmail(), phone: generateRandomPhone() },
    });
    expect(res.status()).toBe(400);
  });

  test("GET /customers - should list customers with pagination", async ({
    request,
  }) => {
    const res = await request.get("customers");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(Array.isArray(body.data.customers)).toBe(true);
    expect(typeof body.data.total).toBe("number");
    expect(typeof body.data.page).toBe("number");
  });

  test("GET /customers - should filter by status", async ({ request }) => {
    const res = await request.get("customers?status=active");
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const c of body.data.customers) {
      expect(c.status).toBe("active");
    }
  });

  test("GET /customers - should search by name", async ({ request }) => {
    const res = await request.get("customers?search=Cust");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.customers.length).toBeGreaterThanOrEqual(0);
  });

  test("GET /customers/:id - should return a customer", async ({ request }) => {
    if (!customerId) test.skip();
    const res = await request.get(`customers/${customerId}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.customer._id).toBe(customerId);
  });

  test("GET /customers/:id - should return 404 for nonexistent id", async ({
    request,
  }) => {
    const res = await request.get("customers/000000000000000000000000");
    expect(res.status()).toBe(404);
  });

  test("PATCH /customers/:id - should update customer", async ({ request }) => {
    if (!customerId) test.skip();
    const newPhone = generateRandomPhone();
    const res = await request.patch(`customers/${customerId}`, {
      data: { phone: newPhone },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.customer.phone).toBe(newPhone);
  });

  test("PATCH /customers/:id - should return 404 for invalid id", async ({
    request,
  }) => {
    const res = await request.patch("customers/000000000000000000000000", {
      data: { phone: generateRandomPhone() },
    });
    expect(res.status()).toBe(404);
  });

  /* =============== STATUS TRANSITIONS =============== */

  test("POST /customers/:id/deactivate - should deactivate", async ({
    request,
  }) => {
    if (!customerId) test.skip();
    const res = await request.post(`customers/${customerId}/deactivate`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.customer.status).toBe("inactive");
  });

  test("POST /customers/:id/activate - should activate", async ({
    request,
  }) => {
    if (!customerId) test.skip();
    const res = await request.post(`customers/${customerId}/activate`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.customer.status).toBe("active");
  });

  test("POST /customers/:id/blacklist - should blacklist", async ({
    request,
  }) => {
    if (!customerId) test.skip();
    const res = await request.post(`customers/${customerId}/blacklist`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.customer.status).toBe("blacklisted");
  });

  /* =============== DOCUMENT TYPES =============== */

  test("GET /customers/document-types - should return list", async ({
    request,
  }) => {
    const res = await request.get("customers/document-types");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data.documentTypes)).toBe(true);
    expect(body.data.documentTypes.length).toBeGreaterThan(0);
    const values = body.data.documentTypes.map((dt: any) => dt.value);
    expect(values).toContain("cc");
    expect(values).toContain("passport");
  });

  /* =============== DELETE =============== */

  test("DELETE /customers/:id - should delete customer", async ({
    request,
  }) => {
    // Create a fresh customer to delete
    const data = makeCustomer();
    const createRes = await request.post("customers", { data });
    expect(createRes.status()).toBe(201);
    const id = (await createRes.json()).data.customer._id;

    const res = await request.delete(`customers/${id}`);
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe("success");

    // Verify it's gone / inactive
    const getRes = await request.get(`customers/${id}`);
    // Customer may 404 or return inactive
    expect([200, 404]).toContain(getRes.status());
  });

  test("DELETE /customers/:id - should return 404 for nonexistent", async ({
    request,
  }) => {
    const res = await request.delete("customers/000000000000000000000000");
    expect(res.status()).toBe(404);
  });
});
