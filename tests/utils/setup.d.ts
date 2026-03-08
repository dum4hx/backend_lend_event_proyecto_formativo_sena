import { type APIRequestContext } from "@playwright/test";
export declare const STORAGE_STATE_PATH = "tests/utils/auth/storageState.json";
export declare const ADMIN_STORAGE_STATE_PATH = "tests/utils/auth/adminStorageState.json";
/**
 * Creates a new APIRequestContext pre-loaded with the regular-user
 * storageState (cookies). Useful when a test suite already uses the
 * admin `request` fixture but also needs to make requests as a regular
 * user (e.g. permission-denial assertions).
 */
export declare const createRegularUserContext: (baseURL: string) => Promise<APIRequestContext>;
//# sourceMappingURL=setup.d.ts.map