import { type APIResponse } from "@playwright/test";
export declare const generateRandomEmail: () => string;
export declare const generateRandomPhone: () => string;
export declare const generateTaxId: () => string;
export declare const validateAuthCookies: (response: APIResponse, cookieNames?: string[]) => void;
export declare const defaultOrgData: () => {
    organization: {
        name: string;
        legalName: string;
        email: string;
        phone: string;
        taxId: string;
        address: {
            street: string;
            city: string;
            state: string;
            country: string;
            postalCode: string;
        };
    };
    owner: {
        name: {
            firstName: string;
            secondName: string;
            firstSurname: string;
            secondSurname: string;
        };
        email: string;
        phone: string;
        password: string;
    };
};
//# sourceMappingURL=helpers.d.ts.map