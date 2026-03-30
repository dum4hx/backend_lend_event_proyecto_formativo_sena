import { test, expect } from "@playwright/test";
import {
  generateRandomEmail,
  generateRandomPhone,
} from "../../utils/helpers.ts";

test.describe("Inspections Create Flow", () => {
  test.describe.configure({ mode: "serial" });

  let locationId: string;
  let categoryId: string;
  let materialTypeId: string;
  let materialInstanceId: string;
  let customerId: string;
  let requestId: string;
  let loanId: string;

  test.beforeAll(async ({ request }) => {
    // 1) Create a location
    const locRes = await request.post("/api/v1/locations", {
      data: {
        name: `Inspect Loc ${Date.now()}`,
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
    const locBody = await locRes.json();
    locationId = locBody.data.location._id;

    // 2) Create material category
    const catRes = await request.post("/api/v1/materials/categories", {
      data: { name: `Cat ${Date.now()}`, description: "Test" },
    });
    expect(catRes.status()).toBe(201);
    const catBody = await catRes.json();
    categoryId = catBody.data.category._id;

    // 3) Create material type
    const typeRes = await request.post("/api/v1/materials/types", {
      data: {
        name: `Type ${Date.now()}`,
        description: "Test type",
        categoryId,
        pricePerDay: 1000,
      },
    });
    expect(typeRes.status()).toBe(201);
    const typeBody = await typeRes.json();
    materialTypeId = typeBody.data.materialType._id;

    // 4) Create material instance
    const instRes = await request.post("/api/v1/materials/instances", {
      data: {
        modelId: materialTypeId,
        serialNumber: `SN-${Date.now()}`,
        locationId,
      },
    });
    expect(instRes.status()).toBe(201);
    const instBody = await instRes.json();
    materialInstanceId = instBody.data.instance._id;

    // 5) Create customer
    const documentNumber = `${Math.floor(Math.random() * 100000000)}`;
    const custRes = await request.post("/api/v1/customers", {
      data: {
        name: { firstName: "Inspect", firstSurname: "Test" },
        email: generateRandomEmail(),
        phone: generateRandomPhone(),
        documentType: "cc",
        documentNumber,
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
    const custBody = await custRes.json();
    customerId = custBody.data.customer._id;

    // 6) Create a loan request for that customer
    const today = new Date();
    const startDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // tomorrow
    const endDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const reqRes = await request.post("/api/v1/requests", {
      data: {
        customerId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        depositDueDate: today.toISOString(),
        items: [
          {
            type: "material",
            referenceId: materialTypeId,
            quantity: 1,
          },
        ],
      },
    });
    expect(reqRes.status()).toBe(201);
    const reqBody = await reqRes.json();
    requestId = reqBody.data.request._id;

    // 7) Approve the request
    const approveRes = await request.post(
      `/api/v1/requests/${requestId}/approve`,
      { data: { notes: "Approved for test" } },
    );
    expect(approveRes.status()).toBe(200);

    // 8) Assign material instance to the request
    const assignRes = await request.post(
      `/api/v1/requests/${requestId}/assign-materials`,
      {
        data: {
          assignments: [{ materialTypeId, materialInstanceId }],
        },
      },
    );
    expect(assignRes.status()).toBe(200);

    // 9) Create loan from request (pickup)
    const loanRes = await request.post(
      `/api/v1/loans/from-request/${requestId}`,
    );
    expect(loanRes.status()).toBe(201);
    const loanBody = await loanRes.json();
    loanId = loanBody.data.loan._id;

    // 10) Mark loan as returned so it is inspectable
    const returnRes = await request.post(`/api/v1/loans/${loanId}/return`, {
      data: { notes: "Returned in test" },
    });
    expect(returnRes.status()).toBe(200);
  });

  test("POST /inspections - create inspection with damage and dueDate", async ({
    request,
  }) => {
    const dueDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days

    const inspectRes = await request.post("/api/v1/inspections", {
      data: {
        loanId,
        overallNotes: "Inspection with damage",
        dueDate: dueDate.toISOString(),
        items: [
          {
            materialInstanceId,
            condition: "damaged",
            damageDescription: "Broken handle",
            damageCost: 50000,
          },
        ],
      },
    });

    expect(inspectRes.status()).toBe(201);
    const body = await inspectRes.json();
    expect(body.status).toBe("success");

    // Verify a damage invoice was created for the loan and has the requested dueDate
    const invRes = await request.get(
      `/api/v1/invoices?loanId=${loanId}&type=damage`,
    );
    expect(invRes.status()).toBe(200);
    const invBody = await invRes.json();
    const invoices = invBody.data.invoices as any[];
    expect(invoices.length).toBeGreaterThan(0);

    const found = invoices.find(
      (i) => i.inspectionId === body.data.inspection._id || i.loanId === loanId,
    );
    expect(found).toBeDefined();
    const foundDue = new Date(found.dueDate).getTime();
    const expectedDue = dueDate.getTime();
    expect(foundDue).toBe(expectedDue);
  });
});
