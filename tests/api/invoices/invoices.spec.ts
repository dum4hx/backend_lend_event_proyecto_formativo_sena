import { test, expect } from "@playwright/test";
import {
  generateRandomEmail,
  generateRandomPhone,
} from "../../utils/helpers.ts";

test.describe.serial("Invoices Module", () => {
  let customerId: string;
  let invoiceId: string;
  let paymentMethodId: string;

  /* ---------- Setup: create a customer and payment method ---------- */

  test("Setup: create customer for invoicing", async ({ request }) => {
    const res = await request.post("customers", {
      data: {
        name: { firstName: "Invoice", firstSurname: "Customer" },
        email: generateRandomEmail(),
        phone: generateRandomPhone(),
        documentType: "cc",
        documentNumber: `${Math.floor(Math.random() * 100000000)}`,
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
    customerId = (await res.json()).data.customer._id;
  });

  test("Setup: create payment method", async ({ request }) => {
    const res = await request.post("payment-methods", {
      data: { name: `TestPay ${Date.now()}`, description: "For invoice tests" },
    });
    expect(res.status()).toBe(201);
    paymentMethodId = (await res.json()).data.paymentMethod._id;
  });

  /* ===================== LIST ===================== */

  test("GET /invoices - should list invoices", async ({ request }) => {
    const res = await request.get("invoices");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data).toBeDefined();
  });

  test("GET /invoices - should filter by status", async ({ request }) => {
    const res = await request.get("invoices?status=draft");
    expect(res.status()).toBe(200);
  });

  test("GET /invoices - should filter by type", async ({ request }) => {
    const res = await request.get("invoices?type=damage");
    expect(res.status()).toBe(200);
  });

  /* ===================== SUMMARY ===================== */

  test("GET /invoices/summary - should return summary stats", async ({
    request,
  }) => {
    const res = await request.get("invoices/summary");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data).toBeDefined();
  });

  /* ===================== CREATE ===================== */

  test("POST /invoices - should create an invoice", async ({ request }) => {
    if (!customerId) test.skip();
    const dueDate = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const res = await request.post("invoices", {
      data: {
        customerId,
        type: "additional_service",
        items: [
          {
            description: "Sound system rental — day rate",
            quantity: 3,
            unitPrice: 15000,
          },
        ],
        dueDate,
        notes: "Test invoice",
        taxRate: 0.19,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.invoice).toBeDefined();
    expect(body.data.invoice.customerId).toBeDefined();
    expect(body.data.invoice.status).toBe("draft");
    invoiceId = body.data.invoice._id;
  });

  test("POST /invoices - should reject missing customerId", async ({
    request,
  }) => {
    const res = await request.post("invoices", {
      data: {
        type: "damage",
        items: [{ description: "test", quantity: 1, unitPrice: 100 }],
        dueDate: new Date(Date.now() + 86400000).toISOString(),
      },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /invoices - should reject empty items", async ({ request }) => {
    if (!customerId) test.skip();
    const res = await request.post("invoices", {
      data: {
        customerId,
        type: "damage",
        items: [],
        dueDate: new Date(Date.now() + 86400000).toISOString(),
      },
    });
    expect(res.status()).toBe(400);
  });

  /* ===================== GET BY ID ===================== */

  test("GET /invoices/:id - should return an invoice", async ({ request }) => {
    if (!invoiceId) test.skip();
    const res = await request.get(`invoices/${invoiceId}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.invoice._id).toBe(invoiceId);
    expect(body.data.invoice.lineItems).toBeDefined();
  });

  test("GET /invoices/:id - should return 404 for nonexistent", async ({
    request,
  }) => {
    const res = await request.get("invoices/000000000000000000000000");
    expect(res.status()).toBe(404);
  });

  /* ===================== SEND ===================== */

  test("POST /invoices/:id/send - should send (transition to pending)", async ({
    request,
  }) => {
    if (!invoiceId) test.skip();
    const res = await request.post(`invoices/${invoiceId}/send`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");

    // Verify status changed to pending
    const getRes = await request.get(`invoices/${invoiceId}`);
    const inv = (await getRes.json()).data.invoice;
    expect(inv.status).toBe("pending");
  });

  test("POST /invoices/:id/send - should 404 for nonexistent", async ({
    request,
  }) => {
    const res = await request.post("invoices/000000000000000000000000/send");
    expect(res.status()).toBe(404);
  });

  /* ===================== PAY ===================== */

  test("POST /invoices/:id/pay - should record a payment", async ({
    request,
  }) => {
    if (!invoiceId || !paymentMethodId) test.skip();

    // Get total to know amount
    const getRes = await request.get(`invoices/${invoiceId}`);
    const inv = (await getRes.json()).data.invoice;
    const amount = inv.totalAmount ?? inv.amountDue ?? 100;

    const res = await request.post(`invoices/${invoiceId}/pay`, {
      data: {
        amount,
        paymentMethodId,
        reference: `REF-${Date.now()}`,
        notes: "Full payment",
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.payment).toBeDefined();
  });

  test("POST /invoices/:id/pay - should reject without paymentMethodId", async ({
    request,
  }) => {
    if (!invoiceId) test.skip();
    const res = await request.post(`invoices/${invoiceId}/pay`, {
      data: { amount: 100 },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /invoices/:id/pay - should transition to partially_paid on partial payment", async ({
    request,
  }) => {
    if (!customerId || !paymentMethodId) test.skip();

    // Create a new invoice for this test
    const createRes = await request.post("invoices", {
      data: {
        customerId,
        type: "additional_service",
        items: [
          {
            description: "Partial payment test",
            quantity: 1,
            unitPrice: 1000,
          },
        ],
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        taxRate: 0.19,
      },
    });
    expect(createRes.status()).toBe(201);
    const partialInvoiceId = (await createRes.json()).data.invoice._id;

    // Send invoice (transition to pending)
    const sendRes = await request.post(`invoices/${partialInvoiceId}/send`);
    expect(sendRes.status()).toBe(200);

    // Get invoice to know total amount
    const getRes = await request.get(`invoices/${partialInvoiceId}`);
    const inv = (await getRes.json()).data.invoice;
    const totalAmount = inv.totalAmount;
    const partialAmount = totalAmount * 0.5; // Pay 50%

    // Make partial payment
    const payRes = await request.post(`invoices/${partialInvoiceId}/pay`, {
      data: {
        amount: partialAmount,
        paymentMethodId,
        reference: `PARTIAL-${Date.now()}`,
        notes: "Partial payment test",
      },
    });
    expect(payRes.status()).toBe(200);

    // Verify status is now partially_paid
    const verifyRes = await request.get(`invoices/${partialInvoiceId}`);
    const updatedInvoice = (await verifyRes.json()).data.invoice;
    expect(updatedInvoice.status).toBe("partially_paid");
    expect(updatedInvoice.amountPaid).toBeGreaterThan(0);
    expect(updatedInvoice.amountDue).toBeGreaterThan(0);
    expect(updatedInvoice.amountPaid + updatedInvoice.amountDue).toBeCloseTo(
      totalAmount,
      2,
    );
  });

  /* ===================== VOID ===================== */

  test("POST /invoices/:id/void - should void a new invoice", async ({
    request,
  }) => {
    if (!customerId) test.skip();

    // Create a fresh invoice to void
    const createRes = await request.post("invoices", {
      data: {
        customerId,
        type: "penalty",
        items: [{ description: "Void test", quantity: 1, unitPrice: 500 }],
        dueDate: new Date(Date.now() + 86400000).toISOString(),
      },
    });
    expect(createRes.status()).toBe(201);
    const voidId = (await createRes.json()).data.invoice._id;

    const res = await request.post(`invoices/${voidId}/void`, {
      data: { reason: "Created in error" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
  });

  test("POST /invoices/:id/void - should reject without reason", async ({
    request,
  }) => {
    if (!invoiceId) test.skip();
    const res = await request.post(`invoices/${invoiceId}/void`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });
});
