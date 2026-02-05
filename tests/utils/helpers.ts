import { type APIResponse, expect } from "@playwright/test";

export const generateRandomEmail = () =>
  `test.${Date.now()}.${Math.floor(Math.random() * 10000)}@example.com`;

export const generateRandomPhone = () =>
  `+57300${Math.floor(Math.random() * 10000000)}`;

export const generateTaxId = () =>
  `${Math.floor(Math.random() * 100000000)}-${Math.floor(Math.random() * 9)}`;

export const validateAuthCookies = (
  response: APIResponse,
  cookieNames: string[] = ["access_token", "refresh_token"],
) => {
  const headers = response.headersArray();
  const setCookieHeaders = headers.filter(
    (header) => header.name.toLowerCase() === "set-cookie",
  );

  expect(
    setCookieHeaders.length,
    "No Set-Cookie headers found in response",
  ).toBeGreaterThan(0);

  const cookies = setCookieHeaders.map((header) => {
    // Basic extraction of cookie name
    return header.value.split(";")[0]?.split("=")[0]?.trim();
  });

  cookieNames.forEach((name) => {
    expect(cookies, `Cookie '${name}' should be present in response`).toContain(
      name,
    );
  });
};

export const defaultOrgData = () => ({
  organization: {
    name: `Test Org ${Date.now()}`,
    legalName: `Test Org Legal ${Date.now()}`,
    email: generateRandomEmail(),
    phone: generateRandomPhone(),
    taxId: generateTaxId(),
    address: {
      street: "Calle 123 #45-67",
      city: "Bogotá",
      country: "Colombia",
      postalCode: "110111",
    },
  },
  owner: {
    name: {
      firstName: "Test",
      secondName: "User",
      firstSurname: "Owner",
      secondSurname: "One",
    },
    email: generateRandomEmail(),
    phone: generateRandomPhone(),
    password: "Password123!",
  },
});
