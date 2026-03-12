import { test, expect } from "@playwright/test";
import { generateRandomEmail, generateRandomPhone } from "../../utils/helpers.ts";

const extractId = (entity: unknown, label: string): string => {
  if (!entity || typeof entity !== "object") {
    throw new Error(`${label} payload is missing`);
  }

  const record = entity as Record<string, unknown>;
  const id = record.id ?? record._id;

  if (typeof id !== "string") {
    throw new Error(`${label} id was not returned by API`);
  }

  return id;
};

const getOrganizationId = async (
  request: Parameters<typeof test>[0] extends never
    ? never
    : import("@playwright/test").APIRequestContext,
): Promise<string> => {
  const meRes = await request.get("auth/me");
  expect(meRes.status()).toBe(200);

  const meBody = (await meRes.json()) as {
    data?: { user?: { organizationId?: string } };
  };

  const organizationId = meBody.data?.user?.organizationId;
  if (!organizationId) {
    throw new Error("organizationId was not returned by auth/me");
  }

  return organizationId;
};

const createCustomer = async (
  request: import("@playwright/test").APIRequestContext,
): Promise<string> => {
  const customerRes = await request.post("customers", {
    data: {
      name: {
        firstName: "Request",
        firstSurname: `Customer-${Date.now()}`,
      },
      email: generateRandomEmail(),
      phone: generateRandomPhone(),
      documentType: "cc",
      documentNumber: `${Date.now()}`,
      address: {
        country: "Colombia",
        city: "Bogota",
        street: "Street 123",
      },
    },
  });

  expect(customerRes.status()).toBe(201);
  const customerBody = (await customerRes.json()) as {
    data?: { customer?: Record<string, unknown> };
  };
  return extractId(customerBody.data?.customer, "customer");
};

const createMaterialType = async (
  request: import("@playwright/test").APIRequestContext,
  organizationId: string,
): Promise<string> => {
  const categoryRes = await request.post("materials/categories", {
    data: {
      name: `Request Category ${Date.now()}`,
      description: "Category for request tests",
    },
  });
  expect(categoryRes.status()).toBe(201);

  const categoryBody = (await categoryRes.json()) as {
    data?: { category?: Record<string, unknown> };
  };
  const categoryId = extractId(categoryBody.data?.category, "category");

  const materialTypeRes = await request.post("materials/types", {
    data: {
      organizationId,
      categoryId,
      name: `Request Material ${Date.now()}`,
      description: "Material for request tests",
      pricePerDay: 10,
      attributes: [],
    },
  });

  expect(materialTypeRes.status()).toBe(201);
  const materialTypeBody = (await materialTypeRes.json()) as {
    data?: { materialType?: Record<string, unknown> };
  };

  return extractId(materialTypeBody.data?.materialType, "materialType");
};

const createPackage = async (
  request: import("@playwright/test").APIRequestContext,
  materialTypeId: string,
): Promise<string> => {
  const packageRes = await request.post("packages", {
    data: {
      name: `Request Package ${Date.now()}`,
      description: "Package for request tests",
      items: [
        {
          materialTypeId,
          quantity: 1,
        },
      ],
      pricePerDay: 20,
      discountRate: 0,
      depositAmount: 0,
    },
  });

  expect(packageRes.status()).toBe(201);
  const packageBody = (await packageRes.json()) as {
    data?: { package?: Record<string, unknown> };
  };

  return extractId(packageBody.data?.package, "package");
};

const buildRequestBody = (
  customerId: string,
  items: Array<Record<string, unknown>>,
) => {
  const startDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const endDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  return {
    customerId,
    items,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    notes: "Request tests",
  };
};

test.describe("Requests Module", () => {
  test("GET /requests - should list requests", async ({ request }) => {
    const res = await request.get("requests");
    expect(res.status()).toBe(200);
  });

  test("POST /requests - creates request with material referenceId", async ({
    request,
  }) => {
    const organizationId = await getOrganizationId(request);
    const customerId = await createCustomer(request);
    const materialTypeId = await createMaterialType(request, organizationId);

    const res = await request.post("requests", {
      data: buildRequestBody(customerId, [
        {
          type: "material",
          referenceId: materialTypeId,
          quantity: 1,
        },
      ]),
    });

    expect(res.status()).toBe(201);
    const body = (await res.json()) as {
      status: string;
      data?: { request?: { items?: Array<{ type?: string; referenceId?: string }> } };
    };
    expect(body.status).toBe("success");
    expect(body.data?.request?.items?.[0]?.type).toBe("material");
    expect(body.data?.request?.items?.[0]?.referenceId).toBe(materialTypeId);
  });

  test("POST /requests - creates request with package referenceId", async ({
    request,
  }) => {
    const organizationId = await getOrganizationId(request);
    const customerId = await createCustomer(request);
    const materialTypeId = await createMaterialType(request, organizationId);
    const packageId = await createPackage(request, materialTypeId);

    const res = await request.post("requests", {
      data: buildRequestBody(customerId, [
        {
          type: "package",
          referenceId: packageId,
          quantity: 1,
        },
      ]),
    });

    expect(res.status()).toBe(201);
    const body = (await res.json()) as {
      status: string;
      data?: { request?: { items?: Array<{ type?: string; referenceId?: string }> } };
    };
    expect(body.status).toBe("success");
    expect(body.data?.request?.items?.[0]?.type).toBe("package");
    expect(body.data?.request?.items?.[0]?.referenceId).toBe(packageId);
  });

  test("POST /requests - supports legacy materialTypeId payload", async ({
    request,
  }) => {
    const organizationId = await getOrganizationId(request);
    const customerId = await createCustomer(request);
    const materialTypeId = await createMaterialType(request, organizationId);

    const res = await request.post("requests", {
      data: buildRequestBody(customerId, [
        {
          materialTypeId,
          quantity: 1,
        },
      ]),
    });

    expect(res.status()).toBe(201);
    const body = (await res.json()) as {
      data?: { request?: { items?: Array<{ type?: string; referenceId?: string }> } };
    };
    expect(body.data?.request?.items?.[0]?.type).toBe("material");
    expect(body.data?.request?.items?.[0]?.referenceId).toBe(materialTypeId);
  });

  test("POST /requests - supports legacy packageId payload", async ({
    request,
  }) => {
    const organizationId = await getOrganizationId(request);
    const customerId = await createCustomer(request);
    const materialTypeId = await createMaterialType(request, organizationId);
    const packageId = await createPackage(request, materialTypeId);

    const res = await request.post("requests", {
      data: buildRequestBody(customerId, [
        {
          packageId,
          quantity: 1,
        },
      ]),
    });

    expect(res.status()).toBe(201);
    const body = (await res.json()) as {
      data?: { request?: { items?: Array<{ type?: string; referenceId?: string }> } };
    };
    expect(body.data?.request?.items?.[0]?.type).toBe("package");
    expect(body.data?.request?.items?.[0]?.referenceId).toBe(packageId);
  });

  test("POST /requests - fails for invalid item type", async ({ request }) => {
    const customerId = await createCustomer(request);

    const res = await request.post("requests", {
      data: buildRequestBody(customerId, [
        {
          type: "invalid",
          referenceId: "507f1f77bcf86cd799439011",
          quantity: 1,
        },
      ]),
    });

    expect(res.status()).toBe(400);
    const body = (await res.json()) as { code?: string; message?: string };
    expect(body.code).toBe("BAD_REQUEST");
    expect(body.message).toContain("Invalid type");
  });

  test("POST /requests - fails when reference does not exist for type", async ({
    request,
  }) => {
    const customerId = await createCustomer(request);

    const res = await request.post("requests", {
      data: buildRequestBody(customerId, [
        {
          type: "material",
          referenceId: "507f1f77bcf86cd799439011",
          quantity: 1,
        },
      ]),
    });

    expect(res.status()).toBe(404);
    const body = (await res.json()) as { code?: string; message?: string };
    expect(body.code).toBe("NOT_FOUND");
    expect(body.message).toContain("Material not found or inactive");
  });
});
