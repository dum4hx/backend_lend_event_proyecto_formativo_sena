import { request } from "@playwright/test";
export const STORAGE_STATE_PATH = "tests/utils/auth/storageState.json";
export const ADMIN_STORAGE_STATE_PATH = "tests/utils/auth/adminStorageState.json";
/**
 * Creates a new APIRequestContext pre-loaded with the regular-user
 * storageState (cookies). Useful when a test suite already uses the
 * admin `request` fixture but also needs to make requests as a regular
 * user (e.g. permission-denial assertions).
 */
export const createRegularUserContext = async (baseURL) => {
    return request.newContext({
        baseURL,
        storageState: STORAGE_STATE_PATH,
        ignoreHTTPSErrors: true,
    });
};
//# sourceMappingURL=setup.js.map