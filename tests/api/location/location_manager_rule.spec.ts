import { test, expect } from "@playwright/test";
import { defaultOrgData, generateRandomEmail } from "../../utils/helpers.ts";

const buildAddress = () => ({
  streetType: "Calle",
  primaryNumber: "10",
  secondaryNumber: "20",
  complementaryNumber: "30",
  department: "Cundinamarca",
  city: "Bogotá",
});

test.describe("Location Manager Rule", () => {
  test.describe.configure({ mode: "serial" });

  let currentUserId: string;
  let currentUserEmail: string;
  let nonManagerRoleId: string;
  let managerRoleId: string;
  let locationId: string;
  let alternateManagerId: string;

  test.beforeAll(async ({ request }) => {
    const meRes = await request.get("auth/me");
    expect(meRes.status()).toBe(200);
    const meBody = await meRes.json();
    currentUserId = meBody.data.user._id ?? meBody.data.user.id;
    currentUserEmail = meBody.data.user.email;

    const rolesRes = await request.get("roles");
    expect(rolesRes.status()).toBe(200);
    const rolesBody = await rolesRes.json();
    const nonManagerRole = (rolesBody.data.items as Array<any>).find((role) => {
      const normalized = (role.name ?? "").toLowerCase().trim();
      return normalized !== "gerente" && normalized !== "propietario";
    });

    const managerRole = (rolesBody.data.items as Array<any>).find((role) => {
      const normalized = (role.name ?? "").toLowerCase().trim();
      return normalized === "gerente" || normalized === "manager";
    });

    if (!nonManagerRole || !managerRole) {
      throw new Error("No se encontraron roles requeridos para las pruebas");
    }

    nonManagerRoleId = nonManagerRole._id;
    managerRoleId = managerRole._id;
  });

  test("POST /locations - debe rechazar creación sin managerId", async ({ request }) => {
    const response = await request.post("locations", {
      data: {
        code: `LOC${Date.now()}`,
        name: `Sede sin gerente ${Date.now()}`,
        address: buildAddress(),
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("BAD_REQUEST");
  });

  test("POST /locations - debe rechazar managerId con formato inválido", async ({
    request,
  }) => {
    const response = await request.post("locations", {
      data: {
        code: `LOC${Date.now()}`,
        name: `Sede formato inválido ${Date.now()}`,
        managerId: "manager-no-valido",
        address: buildAddress(),
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("BAD_REQUEST");
  });

  test("POST /locations - debe rechazar manager inexistente", async ({ request }) => {
    const response = await request.post("locations", {
      data: {
        code: `LOC${Date.now()}`,
        name: `Sede manager inexistente ${Date.now()}`,
        managerId: "507f1f77bcf86cd799439011",
        address: buildAddress(),
      },
    });

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.code).toBe("NOT_FOUND");
  });

  test("POST /locations - debe rechazar manager de otra organización", async ({ request }) => {
    const otherOrgData = defaultOrgData();

    const registerRes = await request.post("auth/register", {
      data: otherOrgData,
    });
    expect(registerRes.status()).toBe(202);
    const registerBody = await registerRes.json();
    const otherOrgUserId = registerBody.data.user.id;

    const response = await request.post("locations", {
      data: {
        code: `LOC${Date.now()}`,
        name: `Sede org distinta ${Date.now()}`,
        managerId: otherOrgUserId,
        address: buildAddress(),
      },
    });

    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("CONFLICT");
  });

  test("POST /locations - debe rechazar usuario sin rol de gerente", async ({
    request,
  }) => {
    const baseLocationRes = await request.post("locations", {
      data: {
        code: `LOC${Date.now()}BASE`,
        name: `Sede base invitación ${Date.now()}`,
        managerId: currentUserId,
        address: buildAddress(),
      },
    });
    expect(baseLocationRes.status()).toBe(201);
    const baseLocationBody = await baseLocationRes.json();

    const inviteRes = await request.post("users/invite", {
      data: {
        name: { firstName: "Invitado", firstSurname: "NoGerente" },
        email: generateRandomEmail(),
        phone: `+57300${Math.floor(Math.random() * 10000000)}`,
        roleId: nonManagerRoleId,
        locations: [baseLocationBody.data._id],
      },
    });

    expect(inviteRes.status()).toBe(201);
    const inviteBody = await inviteRes.json();
    const invitedUserId = inviteBody.data.user.id;

    const createRes = await request.post("locations", {
      data: {
        code: `LOC${Date.now()}`,
        name: `Sede gerente inválido ${Date.now()}`,
        managerId: invitedUserId,
        address: buildAddress(),
      },
    });

    expect(createRes.status()).toBe(409);
    const createBody = await createRes.json();
    expect(createBody.code).toBe("CONFLICT");
  });

  test("POST /locations - debe crear ubicación con gerente válido", async ({ request }) => {
    const response = await request.post("locations", {
      data: {
        code: `LOC${Date.now()}`,
        name: `Sede válida ${Date.now()}`,
        managerId: currentUserId,
        address: buildAddress(),
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.data.managerId).toBe(currentUserId);
    expect(body.data.manager).toBeDefined();
    expect(body.data.manager.email).toBe(currentUserEmail);
    locationId = body.data._id;
  });

  test("POST /locations - debe rechazar asignar el mismo gerente en dos sedes", async ({
    request,
  }) => {
    const response = await request.post("locations", {
      data: {
        code: `LOC${Date.now()}DUP`,
        name: `Sede gerente duplicado ${Date.now()}`,
        managerId: currentUserId,
        address: buildAddress(),
      },
    });

    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("CONFLICT");
    expect(body.message).toContain("solo se permite una sede activa");
  });

  test("PATCH /locations/:id - debe rechazar intento de quitar manager", async ({
    request,
  }) => {
    const response = await request.patch(`locations/${locationId}`, {
      data: {
        managerId: "",
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("BAD_REQUEST");
  });

  test("PATCH /locations/:id - debe rechazar cambio a manager inválido", async ({
    request,
  }) => {
    const response = await request.patch(`locations/${locationId}`, {
      data: {
        managerId: "507f1f77bcf86cd799439011",
      },
    });

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.code).toBe("NOT_FOUND");
  });

  test("GET /locations y GET /locations/:id - debe incluir manager y managerId", async ({
    request,
  }) => {
    const listRes = await request.get("locations");
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();

    const listed = (listBody.data.items as Array<any>).find(
      (item) => item._id === locationId,
    );

    expect(listed).toBeDefined();
    expect(listed.managerId).toBe(currentUserId);
    expect(listed.manager).toBeDefined();
    expect(listed.manager._id).toBe(currentUserId);
    expect(listed.manager).toHaveProperty("email");
    expect(listed.manager).toHaveProperty("roleId");
    expect(listed.manager).toHaveProperty("roleName");
    expect(listed.manager).toHaveProperty("status");

    const detailRes = await request.get(`locations/${locationId}`);
    expect(detailRes.status()).toBe(200);
    const detailBody = await detailRes.json();

    expect(detailBody.data.managerId).toBe(currentUserId);
    expect(detailBody.data.manager).toBeDefined();
    expect(detailBody.data.manager._id).toBe(currentUserId);
    expect(detailBody.data.manager).toHaveProperty("email");
    expect(detailBody.data.manager).toHaveProperty("roleId");
    expect(detailBody.data.manager).toHaveProperty("roleName");
    expect(detailBody.data.manager).toHaveProperty("status");
  });

  test("POST /locations/import - debe procesar filas válidas e inválidas", async ({
    request,
  }) => {
    const inviteManagerRes = await request.post("users/invite", {
      data: {
        name: { firstName: "Manager", firstSurname: "Import" },
        email: generateRandomEmail(),
        phone: `+57300${Math.floor(Math.random() * 10000000)}`,
        roleId: managerRoleId,
        locations: [locationId],
      },
    });

    expect(inviteManagerRes.status()).toBe(201);
    const inviteManagerBody = await inviteManagerRes.json();
    alternateManagerId = inviteManagerBody.data.user.id;

    const response = await request.post("locations/import", {
      data: {
        rows: [
          {
            code: `LOC${Date.now()}A`,
            name: `Import válida ${Date.now()}`,
            managerId: alternateManagerId,
            address: buildAddress(),
          },
          {
            code: `LOC${Date.now()}B`,
            name: `Import sin gerente ${Date.now()}`,
            address: buildAddress(),
          },
          {
            code: `LOC${Date.now()}C`,
            name: `Import email inválido ${Date.now()}`,
            managerEmail: "no-existe@example.com",
            address: buildAddress(),
          },
        ],
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body.data.totalRows).toBe(3);
    expect(body.data.createdCount).toBe(1);
    expect(body.data.failedCount).toBe(2);
    expect(Array.isArray(body.data.results)).toBeTruthy();

    const failedRows = body.data.results.filter((r: any) => r.status === "failed");
    expect(failedRows.length).toBe(2);
  });
});
