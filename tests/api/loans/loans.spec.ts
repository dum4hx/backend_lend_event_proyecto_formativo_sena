import { test, expect } from "@playwright/test";
import {
  generateRandomEmail,
  generateRandomPhone,
} from "../../utils/helpers.ts";

test.describe("Loans Module", () => {
  test("GET /loans - should list active loans", async ({ request }) => {
    const res = await request.get("loans");
    expect(res.status()).toBe(200);
  });
});

/* ------------------------------------------------------------------ */
/* Deposit Lifecycle Tests                                             */
/* ------------------------------------------------------------------ */

test.describe("Loans – Deposit Lifecycle", () => {
  test.describe.configure({ mode: "serial" });

  // Shared state wired up in beforeAll
  let locationId: string;
  let materialTypeId: string;
  let customerId: string;

  /**
   * Helper – builds a full loan (request → assign → deposit payment → checkout → return)
   * and returns { loanId, materialInstanceId }.
   * depositAmount: 0 means no deposit.
   */
  async function buildReturnedLoan(
    req: any,
    depositAmount = 0,
  ): Promise<{
    loanId: string;
    materialInstanceId: string;
    requestId: string;
  }> {
    // Material instance
    const instRes = await req.post("/api/v1/materials/instances", {
      data: {
        modelId: materialTypeId,
        serialNumber: `SN-DEP-${Date.now()}-${Math.random()}`,
        locationId,
      },
    });
    expect(instRes.status()).toBe(201);
    const materialInstanceId = (await instRes.json()).data.instance._id;

    // Request
    const endDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const reqRes = await req.post("/api/v1/requests", {
      data: {
        customerId,
        startDate: new Date().toISOString(),
        endDate: endDate.toISOString(),
        depositDueDate: new Date().toISOString(),
        depositAmount,
        items: [{ type: "material", referenceId: materialTypeId, quantity: 1 }],
      },
    });
    expect(reqRes.status()).toBe(201);
    const requestId = (await reqRes.json()).data.request._id;

    // Approve
    const approveRes = await req.post(`/api/v1/requests/${requestId}/approve`, {
      data: { notes: "auto-approve" },
    });
    expect(approveRes.status()).toBe(200);

    // Assign
    const assignRes = await req.post(
      `/api/v1/requests/${requestId}/assign-materials`,
      { data: { assignments: [{ materialTypeId, materialInstanceId }] } },
    );
    expect(assignRes.status()).toBe(200);

    // Pay deposit if needed
    if (depositAmount > 0) {
      const payRes = await req.post(
        `/api/v1/requests/${requestId}/record-payment`,
      );
      expect(payRes.status()).toBe(200);
    }

    // Checkout (create loan)
    const loanRes = await req.post(`/api/v1/loans/from-request/${requestId}`);
    expect(loanRes.status()).toBe(201);
    const loanId = (await loanRes.json()).data.loan._id;

    // Return
    const returnRes = await req.post(`/api/v1/loans/${loanId}/return`, {
      data: { notes: "returned in test" },
    });
    expect(returnRes.status()).toBe(200);

    return { loanId, materialInstanceId, requestId };
  }

  test.beforeAll(async ({ request }) => {
    // Location
    const locRes = await request.post("/api/v1/locations", {
      data: {
        name: `Dep Loc ${Date.now()}`,
        address: {
          streetType: "Calle",
          primaryNumber: "1",
          secondaryNumber: "1",
          complementaryNumber: "1",
          department: "Cundinamarca",
          city: "Bogotá",
        },
      },
    });
    expect(locRes.status()).toBe(201);
    locationId = (await locRes.json()).data.location._id;

    // Category
    const catRes = await request.post("/api/v1/materials/categories", {
      data: { name: `DepCat ${Date.now()}`, description: "Deposit tests" },
    });
    expect(catRes.status()).toBe(201);
    const categoryId = (await catRes.json()).data.category._id;

    // Material type
    const typeRes = await request.post("/api/v1/materials/types", {
      data: {
        name: `DepType ${Date.now()}`,
        description: "type",
        categoryId,
        pricePerDay: 10000,
      },
    });
    expect(typeRes.status()).toBe(201);
    materialTypeId = (await typeRes.json()).data.materialType._id;

    // Customer
    const custRes = await request.post("/api/v1/customers", {
      data: {
        name: { firstName: "Deposit", firstSurname: "Tester" },
        email: generateRandomEmail(),
        phone: generateRandomPhone(),
        documentType: "cc",
        documentNumber: `${Math.floor(Math.random() * 100000000)}`,
        address: {
          streetType: "Calle",
          primaryNumber: "1",
          secondaryNumber: "1",
          complementaryNumber: "1",
          department: "Cundinamarca",
          city: "Bogotá",
        },
      },
    });
    expect(custRes.status()).toBe(201);
    customerId = (await custRes.json()).data.customer._id;
  });

  /* ---- Test 1: Loan with deposit.status === "held" after checkout ---- */

  test("loan.deposit.status should be 'held' after checkout with deposit", async ({
    request,
  }) => {
    const { loanId } = await buildReturnedLoan(request, 50000);

    const loanRes = await request.get(`/api/v1/loans/${loanId}`);
    const loan = (await loanRes.json()).data.loan;

    expect(loan.deposit.amount).toBe(50000);
    expect(loan.deposit.status).toBe("held");
    expect(loan.deposit.transactions).toHaveLength(1);
    expect(loan.deposit.transactions[0].type).toBe("held");
  });

  test("GET /loans/:id admite materialSearch para filtrar materiales asociados", async ({
    request,
  }) => {
    const { loanId, materialInstanceId } = await buildReturnedLoan(request, 0);

    const instanceRes = await request.get(
      `/api/v1/materials/instances/${materialInstanceId}`,
    );
    expect(instanceRes.status()).toBe(200);
    const serialNumber = (await instanceRes.json()).data.instance.serialNumber;

    const baseLoanRes = await request.get(`/api/v1/loans/${loanId}`);
    expect(baseLoanRes.status()).toBe(200);
    const baseLoan = (await baseLoanRes.json()).data.loan;
    expect(baseLoan.materialInstances.length).toBeGreaterThan(0);

    const filteredLoanRes = await request.get(
      `/api/v1/loans/${loanId}?materialSearch=${encodeURIComponent(serialNumber.slice(0, 6))}`,
    );
    expect(filteredLoanRes.status()).toBe(200);
    const filteredLoan = (await filteredLoanRes.json()).data.loan;
    expect(filteredLoan.materialInstances.length).toBe(1);

    const noMatchLoanRes = await request.get(
      `/api/v1/loans/${loanId}?materialSearch=${encodeURIComponent("SIN-COINCIDENCIA-TEST")}`,
    );
    expect(noMatchLoanRes.status()).toBe(200);
    const noMatchLoan = (await noMatchLoanRes.json()).data.loan;
    expect(noMatchLoan.materialInstances).toHaveLength(0);
  });

  test("GET /loans/:id rechaza materialSearch con groupByMaterialType", async ({
    request,
  }) => {
    const { loanId } = await buildReturnedLoan(request, 0);

    const res = await request.get(
      `/api/v1/loans/${loanId}?groupByMaterialType=true&materialSearch=abc`,
    );
    expect(res.status()).toBe(400);
  });

  test("GET /loans/:id/materials lista materiales con paginación y búsqueda", async ({
    request,
  }) => {
    const { loanId, materialInstanceId } = await buildReturnedLoan(request, 0);

    const instanceRes = await request.get(
      `/api/v1/materials/instances/${materialInstanceId}`,
    );
    expect(instanceRes.status()).toBe(200);
    const serialNumber = (await instanceRes.json()).data.instance.serialNumber;

    const listRes = await request.get(`/api/v1/loans/${loanId}/materials`);
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();

    expect(listBody.status).toBe("success");
    expect(listBody.data.loan._id).toBe(loanId);
    expect(Array.isArray(listBody.data.materials)).toBeTruthy();
    expect(listBody.data.materials.length).toBeGreaterThan(0);
    expect(listBody.data.total).toBeGreaterThan(0);

    const searchRes = await request.get(
      `/api/v1/loans/${loanId}/materials?search=${encodeURIComponent(serialNumber.slice(0, 6))}&limit=5&page=1`,
    );
    expect(searchRes.status()).toBe(200);
    const searchBody = await searchRes.json();

    expect(searchBody.data.page).toBe(1);
    expect(searchBody.data.totalPages).toBeGreaterThan(0);
    expect(searchBody.data.materials.length).toBeGreaterThan(0);
    expect(
      searchBody.data.materials[0].materialInstanceId.serialNumber,
    ).toContain(serialNumber.slice(0, 6));
  });

  test("POST /loans/:id/return registra trazabilidad de retiro y devolución", async ({
    request,
  }) => {
    const { loanId } = await buildReturnedLoan(request, 0);

    const loanRes = await request.get(`/api/v1/loans/${loanId}`);
    expect(loanRes.status()).toBe(200);
    const loan = (await loanRes.json()).data.loan;

    expect(Array.isArray(loan.traceabilityEvents)).toBeTruthy();
    expect(loan.traceabilityEvents.length).toBeGreaterThanOrEqual(2);

    const eventTypes = loan.traceabilityEvents.map((event: any) => event.eventType);
    expect(eventTypes).toContain("checkout");
    expect(eventTypes).toContain("return_received");
  });

  /* ---- Test 2: Deposit fully covers damage → status = "applied", invoice = "paid" ---- */

  test("inspection – deposit fully covers damage: deposit 'applied', invoice 'paid'", async ({
    request,
  }) => {
    const DEPOSIT = 200000; // 200k deposit
    const DAMAGE_COST = 100000; // 100k damage (total with IVA = 119k < deposit)
    const { loanId, materialInstanceId } = await buildReturnedLoan(
      request,
      DEPOSIT,
    );

    const inspectRes = await request.post("/api/v1/inspections", {
      data: {
        loanId,
        items: [
          {
            materialInstanceId,
            condition: "damaged",
            damageDescription: "Cracked screen",
            damageCost: DAMAGE_COST,
          },
        ],
      },
    });
    expect(inspectRes.status()).toBe(201);

    // Loan deposit should be "applied"
    const loanRes = await request.get(`/api/v1/loans/${loanId}`);
    const loan = (await loanRes.json()).data.loan;
    expect(loan.deposit.status).toBe("applied");

    const appliedTx = loan.deposit.transactions.find(
      (t: any) => t.type === "applied",
    );
    expect(appliedTx).toBeDefined();
    expect(appliedTx.amount).toBeCloseTo(DAMAGE_COST * 1.19, 0);

    // Invoice should be "paid"
    const invRes = await request.get(
      `/api/v1/invoices?loanId=${loanId}&type=damage`,
    );
    const invoices = (await invRes.json()).data.invoices as any[];
    expect(invoices.length).toBeGreaterThan(0);
    expect(invoices[0].status).toBe("paid");
  });

  /* ---- Test 3: Deposit partially covers damage → "partially_applied", invoice "partially_paid" ---- */

  test("inspection – deposit partially covers damage: 'partially_applied', invoice 'partially_paid'", async ({
    request,
  }) => {
    const DEPOSIT = 10000; // 10k deposit
    const DAMAGE_COST = 100000; // 100k damage (total with IVA = 119k > deposit)
    const { loanId, materialInstanceId } = await buildReturnedLoan(
      request,
      DEPOSIT,
    );

    const inspectRes = await request.post("/api/v1/inspections", {
      data: {
        loanId,
        items: [
          {
            materialInstanceId,
            condition: "damaged",
            damageDescription: "Major damage",
            damageCost: DAMAGE_COST,
          },
        ],
      },
    });
    expect(inspectRes.status()).toBe(201);

    const loanRes = await request.get(`/api/v1/loans/${loanId}`);
    const loan = (await loanRes.json()).data.loan;
    expect(loan.deposit.status).toBe("partially_applied");

    const invRes = await request.get(
      `/api/v1/invoices?loanId=${loanId}&type=damage`,
    );
    const invoices = (await invRes.json()).data.invoices as any[];
    expect(invoices[0].status).toBe("partially_paid");
  });

  /* ---- Test 4: No damages → deposit status = "refund_pending" ---- */

  test("inspection – no damages: deposit status becomes 'refund_pending'", async ({
    request,
  }) => {
    const { loanId, materialInstanceId } = await buildReturnedLoan(
      request,
      30000,
    );

    const inspectRes = await request.post("/api/v1/inspections", {
      data: {
        loanId,
        items: [{ materialInstanceId, condition: "good" }],
      },
    });
    expect(inspectRes.status()).toBe(201);

    const loanRes = await request.get(`/api/v1/loans/${loanId}`);
    const loan = (await loanRes.json()).data.loan;
    expect(loan.deposit.status).toBe("refund_pending");
  });

  /* ---- Test 5: completeLoan blocked when deposit.status = "partially_applied" ---- */

  test("completeLoan – blocked (400) when deposit is 'partially_applied'", async ({
    request,
  }) => {
    const { loanId, materialInstanceId } = await buildReturnedLoan(
      request,
      5000,
    );

    // Create inspection with large damage so deposit only partially covers it
    await request.post("/api/v1/inspections", {
      data: {
        loanId,
        items: [
          {
            materialInstanceId,
            condition: "damaged",
            damageDescription: "Partial coverage test",
            damageCost: 100000,
          },
        ],
      },
    });

    const completeRes = await request.post(`/api/v1/loans/${loanId}/complete`);
    expect(completeRes.status()).toBe(400);

    const body = await completeRes.json();
    expect(body.message ?? body.error).toMatch(/deposit/i);
  });

  /* ---- Test 6: POST /loans/:id/deposit/refund happy path ---- */

  test("POST /loans/:id/deposit/refund – marks deposit as 'refunded'", async ({
    request,
  }) => {
    const { loanId, materialInstanceId } = await buildReturnedLoan(
      request,
      40000,
    );

    // Inspection with no damages → "refund_pending"
    await request.post("/api/v1/inspections", {
      data: {
        loanId,
        items: [{ materialInstanceId, condition: "good" }],
      },
    });

    const refundRes = await request.post(
      `/api/v1/loans/${loanId}/deposit/refund`,
      { data: { notes: "Physical refund handed to customer" } },
    );
    expect(refundRes.status()).toBe(200);

    const loan = (await refundRes.json()).data.loan;
    expect(loan.deposit.status).toBe("refunded");

    const refundTx = loan.deposit.transactions.find(
      (t: any) => t.type === "refund",
    );
    expect(refundTx).toBeDefined();
    expect(refundTx.amount).toBe(40000);
  });

  /* ---- Test 7: completeLoan succeeds after deposit refunded ---- */

  test("completeLoan – succeeds after deposit is 'refunded'", async ({
    request,
  }) => {
    const { loanId, materialInstanceId } = await buildReturnedLoan(
      request,
      20000,
    );

    // No damages → refund_pending
    await request.post("/api/v1/inspections", {
      data: {
        loanId,
        items: [{ materialInstanceId, condition: "good" }],
      },
    });

    // Refund deposit
    await request.post(`/api/v1/loans/${loanId}/deposit/refund`);

    // Now complete should succeed
    const completeRes = await request.post(`/api/v1/loans/${loanId}/complete`);
    expect(completeRes.status()).toBe(200);

    const loan = (await completeRes.json()).data.loan;
    expect(loan.status).toBe("closed");
  });
});
