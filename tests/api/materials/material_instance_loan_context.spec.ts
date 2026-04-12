import { test, expect } from "@playwright/test";
import {
  generateRandomEmail,
  generateRandomPhone,
} from "../../utils/helpers.ts";

test.describe.serial("Material Instance Detail - Loan Context", () => {
  let locationId: string;
  let materialTypeId: string;
  let customerId: string;

  test.beforeAll(async ({ request }) => {
    const locRes = await request.post("locations", {
      data: {
        name: `LoanContext Loc ${Date.now()}`,
        address: {
          streetType: "Calle",
          primaryNumber: "20",
          secondaryNumber: "10",
          complementaryNumber: "1",
          department: "Cundinamarca",
          city: "Bogotá",
        },
      },
    });
    expect(locRes.status()).toBe(201);
    locationId = (await locRes.json()).data.location._id;

    const catRes = await request.post("materials/categories", {
      data: {
        name: `LoanContext Cat ${Date.now()}`,
        description: "Context relation test category",
      },
    });
    expect(catRes.status()).toBe(201);
    const categoryId = (await catRes.json()).data.category._id;

    const typeRes = await request.post("materials/types", {
      data: {
        name: `LoanContext Type ${Date.now()}`,
        description: "Context relation test type",
        categoryId,
        pricePerDay: 12000,
      },
    });
    expect(typeRes.status()).toBe(201);
    materialTypeId = (await typeRes.json()).data.materialType._id;

    const customerRes = await request.post("customers", {
      data: {
        name: {
          firstName: "Context",
          firstSurname: "Tester",
        },
        email: generateRandomEmail(),
        phone: generateRandomPhone(),
        documentType: "cc",
        documentNumber: `${Math.floor(Math.random() * 100000000)}`,
        address: {
          streetType: "Calle",
          primaryNumber: "30",
          secondaryNumber: "11",
          complementaryNumber: "2",
          department: "Cundinamarca",
          city: "Bogotá",
        },
      },
    });
    expect(customerRes.status()).toBe(201);
    customerId = (await customerRes.json()).data.customer._id;
  });

  const createInstance = async (request: any) => {
    const response = await request.post("materials/instances", {
      data: {
        modelId: materialTypeId,
        serialNumber: `SN-CONTEXT-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        locationId,
      },
    });

    expect(response.status()).toBe(201);
    return (await response.json()).data.instance._id as string;
  };

  const createAndAssignRequest = async (
    request: any,
    materialInstanceId: string,
  ) => {
    const endDate = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);

    const createReqRes = await request.post("requests", {
      data: {
        customerId,
        startDate: new Date().toISOString(),
        endDate: endDate.toISOString(),
        depositDueDate: new Date().toISOString(),
        items: [{ type: "material", referenceId: materialTypeId, quantity: 1 }],
      },
    });
    expect(createReqRes.status()).toBe(201);

    const createdRequest = (await createReqRes.json()).data.request;
    const requestId = createdRequest._id as string;
    const requestCode = createdRequest.code as string;

    const approveRes = await request.post(`requests/${requestId}/approve`, {
      data: { notes: "Aprobación para prueba de contexto" },
    });
    expect(approveRes.status()).toBe(200);

    const assignRes = await request.post(`requests/${requestId}/assign-materials`, {
      data: { assignments: [{ materialTypeId, materialInstanceId }] },
    });
    expect(assignRes.status()).toBe(200);

    return { requestId, requestCode };
  };

  test("reserved: devuelve requestCode/requestId en loanContext", async ({ request }) => {
    const materialInstanceId = await createInstance(request);
    const { requestId, requestCode } = await createAndAssignRequest(
      request,
      materialInstanceId,
    );

    const detailRes = await request.get(`materials/instances/${materialInstanceId}`);
    expect(detailRes.status()).toBe(200);

    const instance = (await detailRes.json()).data.instance;

    expect(instance.status).toBe("reserved");
    expect(instance.loanContext).toBeDefined();
    expect(instance.loanContext.source).toBe("request");
    expect(instance.loanContext.requestId).toBe(requestId);
    expect(instance.loanContext.requestCode).toBe(requestCode);
    expect(instance.loanContext.loanId).toBeNull();
    expect(instance.loanContext.loanCode).toBeNull();
  });

  test("loaned: devuelve loanCode/loanId y request relacionado en loanContext", async ({
    request,
  }) => {
    const materialInstanceId = await createInstance(request);
    const { requestId, requestCode } = await createAndAssignRequest(
      request,
      materialInstanceId,
    );

    const checkoutRes = await request.post(`loans/from-request/${requestId}`);
    expect(checkoutRes.status()).toBe(201);

    const createdLoan = (await checkoutRes.json()).data.loan;
    const loanId = createdLoan._id as string;
    const loanCode = createdLoan.code as string;

    const detailRes = await request.get(`materials/instances/${materialInstanceId}`);
    expect(detailRes.status()).toBe(200);

    const instance = (await detailRes.json()).data.instance;

    expect(instance.status).toBe("loaned");
    expect(instance.loanContext).toBeDefined();
    expect(instance.loanContext.source).toBe("loan");
    expect(instance.loanContext.loanId).toBe(loanId);
    expect(instance.loanContext.loanCode).toBe(loanCode);
    expect(instance.loanContext.requestId).toBe(requestId);
    expect(instance.loanContext.requestCode).toBe(requestCode);
  });

  test("available: no devuelve códigos en loanContext", async ({ request }) => {
    const materialInstanceId = await createInstance(request);

    const detailRes = await request.get(`materials/instances/${materialInstanceId}`);
    expect(detailRes.status()).toBe(200);

    const instance = (await detailRes.json()).data.instance;

    expect(instance.status).toBe("available");
    expect(instance.loanContext).toBeDefined();
    expect(instance.loanContext.source).toBeNull();
    expect(instance.loanContext.loanId).toBeNull();
    expect(instance.loanContext.loanCode).toBeNull();
    expect(instance.loanContext.requestId).toBeNull();
    expect(instance.loanContext.requestCode).toBeNull();
  });
});
