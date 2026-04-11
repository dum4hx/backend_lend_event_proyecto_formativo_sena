import { test, expect } from "@playwright/test";
import {
  generateRandomEmail,
  generateRandomPhone,
} from "../../utils/helpers.ts";

test.describe("Users Module", () => {
  let nonOwnerRoleId: string;
  let ownerRoleId: string;
  let locationIdA: string;
  let locationIdB: string;

  const OWNER_ROLE_NAME_VARIANTS = new Set(["propietario", "owner"]);

  const isOwnerRole = (roleName?: string) =>
    OWNER_ROLE_NAME_VARIANTS.has((roleName ?? "").trim().toLowerCase());

  test.beforeAll(async ({ request }) => {
    // Get roles to find owner and non-owner role IDs for invite tests
    const rolesRes = await request.get("roles");
    const rolesBody = await rolesRes.json();
    const roles = rolesBody.data.items;
    const nonOwnerRole = roles.find((r: any) => !isOwnerRole(r.name));
    const ownerRole = roles.find((r: any) => isOwnerRole(r.name));

    if (!nonOwnerRole || !ownerRole) {
      throw new Error("No se encontraron roles requeridos para las pruebas");
    }

    nonOwnerRoleId = nonOwnerRole._id;
    ownerRoleId = ownerRole._id;

    // Create two locations for single-vs-multiple validation cases
    const locResA = await request.post("locations", {
      data: {
        name: `Invite Test Loc A ${Date.now()}`,
        address: {
          streetType: "Calle",
          primaryNumber: "1",
          secondaryNumber: "2",
          complementaryNumber: "3",
          department: "Cundinamarca",
          city: "Bogotá",
        },
      },
    });
    const locBodyA = await locResA.json();
    locationIdA = locBodyA.data._id;

    const locResB = await request.post("locations", {
      data: {
        name: `Invite Test Loc B ${Date.now()}`,
        address: {
          streetType: "Carrera",
          primaryNumber: "10",
          secondaryNumber: "20",
          complementaryNumber: "30",
          department: "Cundinamarca",
          city: "Bogotá",
        },
      },
    });
    const locBodyB = await locResB.json();
    locationIdB = locBodyB.data._id;
  });

  test("GET /users - should list users", async ({ request }) => {
    const response = await request.get("users");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("success");
    expect(Array.isArray(body.data.users)).toBeTruthy();
  });

  test("POST /users/invite - should invite a user", async ({ request }) => {
    const inviteData = {
      name: { firstName: "Invited", firstSurname: "User" },
      email: generateRandomEmail(),
      phone: generateRandomPhone(),
      roleId: nonOwnerRoleId,
      locations: [locationIdA],
    };

    const response = await request.post("users/invite", {
      data: inviteData,
    });

    if (response.status() !== 201) {
      const errBody = await response.json();
      throw new Error(
        `Invite failed with ${response.status()}: ${JSON.stringify(errBody)}`,
      );
    }
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data.user.email).toBe(inviteData.email);
    expect(body.data.user.status).toBe("invited");
  });

  test("POST /users/invite - should reject multiple locations for non-owner role", async ({
    request,
  }) => {
    const response = await request.post("users/invite", {
      data: {
        name: { firstName: "No", firstSurname: "Owner" },
        email: generateRandomEmail(),
        phone: generateRandomPhone(),
        roleId: nonOwnerRoleId,
        locations: [locationIdA, locationIdB],
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.message).toContain("Solo el rol de Dueño");
  });

  test("POST /users/invite - should allow multiple locations for owner role", async ({
    request,
  }) => {
    const response = await request.post("users/invite", {
      data: {
        name: { firstName: "Multi", firstSurname: "Owner" },
        email: generateRandomEmail(),
        phone: generateRandomPhone(),
        roleId: ownerRoleId,
        locations: [locationIdA, locationIdB],
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data.user.status).toBe("invited");
  });

  test("PATCH /users/:id - should reject multi-location update for non-owner role", async ({
    request,
  }) => {
    const inviteRes = await request.post("users/invite", {
      data: {
        name: { firstName: "Update", firstSurname: "Single" },
        email: generateRandomEmail(),
        phone: generateRandomPhone(),
        roleId: nonOwnerRoleId,
        locations: [locationIdA],
      },
    });
    expect(inviteRes.status()).toBe(201);
    const inviteBody = await inviteRes.json();
    const userId = inviteBody.data.user.id;

    const response = await request.patch(`users/${userId}`, {
      data: {
        locations: [locationIdA, locationIdB],
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.message).toContain("Solo el rol de Dueño");
  });

  // Additional tests: GET /:id, PATCH /:id, PATCH /:id/role, POST /:id/deactivate, POST /:id/reactivate
});
