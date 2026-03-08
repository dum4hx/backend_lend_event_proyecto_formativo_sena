import { test, expect } from "@playwright/test";
test.describe("Requests Module", () => {
    test("GET /requests - should list requests", async ({ request }) => {
        const res = await request.get("requests");
        expect(res.status()).toBe(200);
    });
    /*
      Full flow would require:
      1. Create Customer
      2. Create Materials
      3. Create Request with those IDs
      4. Approve, etc.
    */
});
//# sourceMappingURL=requests.spec.js.map