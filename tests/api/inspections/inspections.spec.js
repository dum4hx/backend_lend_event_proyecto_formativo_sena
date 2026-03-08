import { test, expect } from "@playwright/test";
test.describe("Inspections Module", () => {
    test("GET /inspections - should list inspections", async ({ request }) => {
        const res = await request.get("inspections");
        expect(res.status()).toBe(200);
    });
});
//# sourceMappingURL=inspections.spec.js.map