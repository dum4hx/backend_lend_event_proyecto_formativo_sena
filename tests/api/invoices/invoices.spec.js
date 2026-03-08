import { test, expect } from "@playwright/test";
test.describe("Invoices Module", () => {
    test("GET /invoices - should list invoices", async ({ request }) => {
        const res = await request.get("invoices");
        expect(res.status()).toBe(200);
    });
});
//# sourceMappingURL=invoices.spec.js.map