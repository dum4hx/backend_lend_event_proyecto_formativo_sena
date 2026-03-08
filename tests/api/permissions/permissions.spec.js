import { test, expect, request as baseRequest } from "@playwright/test";
import { STORAGE_STATE_PATH } from "../../utils/setup.js";
test.describe("Permissions Module", () => {
    test("GET /permissions - should require authentication", async ({ baseURL, }) => {
        // Create a context with no cookies to simulate an unauthenticated request.
        // Cannot use the default `request` fixture here because the global
        // storageState in playwright.config.ts pre-authenticates every request.
        const unauthCtx = await baseRequest.newContext({
            baseURL: baseURL || "",
            ignoreHTTPSErrors: true,
        });
        const response = await unauthCtx.get("/permissions");
        await unauthCtx.dispose();
        expect(response.status()).toBe(401);
        const body = await response.json();
        expect(body.code).toBe("UNAUTHORIZED");
    });
    test("GET /permissions - should list permissions for authenticated user", async ({ baseURL, }) => {
        // Explicitly load from saved storageState — no login needed.
        const authCtx = await baseRequest.newContext({
            baseURL: baseURL || "",
            storageState: STORAGE_STATE_PATH,
            ignoreHTTPSErrors: true,
        });
        const response = await authCtx.get("/permissions");
        await authCtx.dispose();
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.status).toBe("success");
        expect(Array.isArray(body.data.permissions)).toBeTruthy();
        const ids = body.data.permissions.map((p) => p._id);
        expect(ids.length).toBeGreaterThan(0);
        // Owner role should include common permissions like users:read
        expect(ids).toContain("users:read");
    });
});
//# sourceMappingURL=permissions.spec.js.map