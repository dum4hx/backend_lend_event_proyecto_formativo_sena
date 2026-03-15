import { test, expect } from "@playwright/test";

test.describe("Roles Module", () => {
  test("GET /roles - should list default roles", async ({ request }) => {
    const res = await request.get("roles");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(Array.isArray(body.data.items)).toBeTruthy();
    // There should be at least the owner role created at registration
    const names = body.data.items.map((r: any) => r.name);
    expect(names).toContain("owner");
  });

  test("POST /roles - should create a new org-level role", async ({
    request,
  }) => {
    const payload = {
      name: `test_role_${Date.now()}`,
      permissions: ["organization:read", "roles:read"],
      description: "Test org-level custom role",
    };

    const res = await request.post("roles", { data: payload });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data.role).toBeDefined();
    expect(body.data.role.name).toBe(payload.name);

    // store id for next tests
    const createdId = body.data.role._id as string;

    // GET the created role
    const getRes = await request.get(`roles/${createdId}`);
    expect(getRes.status()).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.data.role._id).toBe(createdId);

    // Update the role
    const updateRes = await request.patch(`roles/${createdId}`, {
      data: { description: "Updated description" },
    });
    expect(updateRes.status()).toBe(200);
    const updateBody = await updateRes.json();
    expect(updateBody.data.role.description).toBe("Updated description");

    // Delete the role
    // const delRes = await apiContext.delete(`roles/${createdId}`);
    // expect(delRes.status()).toBe(200);
    // const delBody = await delRes.json();
    // expect(delBody.status).toBe("success");

    // Ensure it no longer exists
    // const getAfterDel = await apiContext.get(`roles/${createdId}`);
    // expect(getAfterDel.status()).toBeGreaterThanOrEqual(400);
  });
});
