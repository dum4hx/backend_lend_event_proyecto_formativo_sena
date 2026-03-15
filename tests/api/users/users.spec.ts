import { test, expect } from "@playwright/test";
import { generateRandomEmail } from "../../utils/helpers.ts";

test.describe("Users Module", () => {
  let roleId: string;
  let locationId: string;

  test.beforeAll(async ({ request }) => {
    // Get roles to find a non-owner roleId for invite
    const rolesRes = await request.get("roles");
    const rolesBody = await rolesRes.json();
    const roles = rolesBody.data.items;
    // Pick any role that is not "owner" — prefer a non-system role if available
    const targetRole = roles.find(
      (r: any) => r.name !== "owner" && r.name !== "super_admin",
    ) ?? roles.find((r: any) => r.name === "owner");
    roleId = targetRole._id;

    // Create a location (required: at least one for invite)
    const locRes = await request.post("locations", {
      data: {
        name: `Invite Test Loc ${Date.now()}`,
        address: {
          country: "Colombia",
          city: "Bogotá",
          street: "Calle 1",
          propertyNumber: "1",
        },
      },
    });
    const locBody = await locRes.json();
    console.log("Location creation status:", locRes.status(), "body:", JSON.stringify(locBody));
    locationId = locBody.data._id;
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
      phone: "+573009998877",
      roleId,
      locations: [locationId],
    };

    const response = await request.post("users/invite", {
      data: inviteData,
    });

    if (response.status() !== 201) {
      console.log("Invite error body:", await response.json());
    }
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data.user.email).toBe(inviteData.email);
    expect(body.data.user.status).toBe("invited");
  });

  // Additional tests: GET /:id, PATCH /:id, PATCH /:id/role, POST /:id/deactivate, POST /:id/reactivate
});
