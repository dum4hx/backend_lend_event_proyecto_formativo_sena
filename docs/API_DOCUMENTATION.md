# LendEvent API Documentation

**Version:** 1.0.0  
**Base URL:** `https://api.test.local/api/v1`  
**Last Updated:** July 2025

---

## Table of Contents

1. [Introduction and Overview](#1-introduction-and-overview)
2. [Getting Started Guide](#2-getting-started-guide)
3. [Authentication and Authorization](#3-authentication-and-authorization)
4. [Reference Documentation](#4-reference-documentation)
   - [Authentication Endpoints](#authentication-endpoints)
   - [User Management Endpoints](#user-management-endpoints)
   - [Roles Endpoints](#roles-endpoints)
   - [Permissions](#permissions)
   - [Organization Endpoints](#organization-endpoints)
   - [Organization Settings](#get-organizationssettings)
   - [Subscription Type Endpoints](#subscription-type-endpoints-super-admin)
   - [Billing Endpoints](#billing-endpoints)
   - [Admin Analytics (Super Admin)](#admin-analytics-endpoints-super-admin-only)
   - [Admin Exports (Super Admin)](#admin-export-endpoints-super-admin-only)
   - [Customer Endpoints](#customer-endpoints)
   - [Location Endpoints](#location-endpoints)
   - [Material Endpoints](#material-endpoints)
   - [Material Attributes Endpoints](#material-attributes-endpoints)
   - [Transfer Endpoints](#transfer-endpoints)
   - [Package Endpoints](#package-endpoints)
   - [Loan Request Endpoints](#loan-request-endpoints)
   - [Loan Endpoints](#loan-endpoints)
   - [Inspection Endpoints](#inspection-endpoints)
   - [Invoice Endpoints](#invoice-endpoints)
   - [Analytics Endpoints (Organization)](#analytics-endpoints-organization)
   - [Reports Endpoints](#reports-endpoints)
   - [Operations Endpoints (Location Dashboard)](#operations-endpoints-location-dashboard)
   - [Background Jobs](#background-jobs)
5. [Code Samples](#5-code-samples)
6. [Rate Limiting and Usage Guidelines](#6-rate-limiting-and-usage-guidelines)
7. [Versioning and Deprecation Policy](#7-versioning-and-deprecation-policy)

### Subscription Type Endpoints (Super Admin)

The subscription type module allows the platform owner to manage plan configurations dynamically. The server implements both public utility routes and super-admin-only management routes. Public endpoints return dollar amounts converted from stored cents (e.g., `baseCost` / 100 → `basePriceMonthly`).

#### Public Routes (no auth required)

##### GET /subscription-types

Lists all active subscription types (public).

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "subscriptionTypes": [
      {
        "plan": "starter",
        "displayName": "Starter",
        "billingModel": "dynamic",
        "maxCatalogItems": 100,
        "maxSeats": 5,
        "durationDays": 30,
        "features": ["Up to 5 team members", "100 catalog items"],
        "basePriceMonthly": 29,
        "pricePerSeat": 5
      }
    ]
  }
}
```

---

##### GET /subscription-types/:plan

Gets a specific subscription type by plan name.

| Parameter | Location | Type   | Required | Description                                       |
| --------- | -------- | ------ | -------- | ------------------------------------------------- |
| plan      | path     | string | Yes      | Plan identifier (e.g., `starter`, `professional`) |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "subscriptionType": {
      "plan": "starter",
      "displayName": "Starter",
      "billingModel": "dynamic",
      "maxCatalogItems": 100,
      "maxSeats": 5,
      "durationDays": 30,
      "features": ["Up to 5 team members", "100 catalog items"],
      "basePriceMonthly": 29,
      "pricePerSeat": 5
    }
  }
}
```

---

##### POST /subscription-types/:plan/calculate-cost

Calculates the cost for a plan with a given seat count. Request body is validated (integer, positive).

| Parameter | Location | Type    | Required | Description     |
| --------- | -------- | ------- | -------- | --------------- |
| plan      | path     | string  | Yes      | Plan identifier |
| seatCount | body     | integer | Yes      | Number of seats |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "plan": "professional",
    "seatCount": 10,
    "baseCost": 99,
    "seatCost": 40,
    "totalCost": 139,
    "currency": "usd"
  }
}
```

---

#### Super Admin Routes (authentication + super_admin required)

All management routes are protected by `authenticate` and `requireSuperAdmin` middleware in the router.

##### GET /subscription-types/admin/all

Lists all subscription types including inactive ones. Requires `super_admin` role.

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "subscriptionTypes": [
      /* full objects including status, stripe IDs, cents-based costs */
    ]
  }
}
```

---

##### POST /subscription-types

Creates a new subscription type (super admin only). Request body validated against server schema.

| Parameter         | Location | Type     | Required | Description                                        |
| ----------------- | -------- | -------- | -------- | -------------------------------------------------- |
| plan              | body     | string   | Yes      | Unique plan identifier (alphanumeric + underscore) |
| displayName       | body     | string   | Yes      | Human-readable name                                |
| description       | body     | string   | No       | Description (max 500 chars)                        |
| billingModel      | body     | string   | Yes      | `fixed` or `dynamic`                               |
| baseCost          | body     | integer  | Yes      | Base cost in cents                                 |
| pricePerSeat      | body     | integer  | Yes      | Price per seat in cents                            |
| maxSeats          | body     | integer  | No       | Max seats (-1 = unlimited, default: -1)            |
| maxCatalogItems   | body     | integer  | No       | Max items (-1 = unlimited, default: -1)            |
| durationDays      | body     | integer  | Yes      | Subscription period in days (min: 1, max: 365)     |
| features          | body     | string[] | No       | List of feature descriptions                       |
| sortOrder         | body     | integer  | No       | Display order (default: 0)                         |
| stripePriceIdBase | body     | string   | No       | Stripe price ID for base                           |
| stripePriceIdSeat | body     | string   | No       | Stripe price ID for seats                          |
| status            | body     | string   | No       | `active`, `inactive`, `deprecated`                 |

**Permission Required:** `subscription_types:create` (super_admin role)

**Response:** `201 Created`

```json
{
  "status": "success",
  "data": {
    "subscriptionType": {
      /* created object */
    }
  }
}
```

---

##### PATCH /subscription-types/:plan

Updates a subscription type (super admin only). Request body validated against update schema. `plan` cannot be changed. `durationDays` must remain within 1–365.

**Permission Required:** `subscription_types:update`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "subscriptionType": {
      /* updated object */
    }
  }
}
```

---

##### DELETE /subscription-types/:plan

Deactivates a subscription type (soft delete) by setting `status` to `inactive`.

**Permission Required:** `subscription_types:delete`

**Response:** `200 OK`

```json
{
  "status": "success",
  "message": "Subscription type \"custom_enterprise\" has been deactivated"
}
```

---

**Router notes:**

- Public endpoints return monetary values converted to dollars (`basePriceMonthly`, `pricePerSeat`) for UI convenience; the database stores amounts in cents.
- Management endpoints are prefixed in code by the router's middleware with `authenticate` and `requireSuperAdmin` — ensure requests include valid auth and appropriate role.
  "permissions": ["organization:read", "users:create", "users:read"]
  },
  "permissions": ["organization:read", "users:create", "users:read"]
  }
  }

````

#### Step 3: Create Your First Customer

```bash
curl -X POST https://api.test.local/api/v1/customers \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "name": {
      "firstName": "Jane",
      "firstSurname": "Smith"
    },
    "email": "jane.smith@example.com",
    "phone": "+15559876543",
    "documentType": "national_id",
    "documentNumber": "123456789"
  }'
````

#### Step 4: Check Payment Status (Owner Only)

```bash
curl -X GET https://api.test.local/api/v1/auth/payment-status \
  -b cookies.txt
```

**Response (200 OK):**

```json
{
  "status": "success",
  "data": {
    "isActive": false,
    "plan": "free",
    "organizationStatus": "active"
  }
}
```

**Note:** New organizations start with a free plan. `isActive` will be `true` once a paid subscription is created via the billing endpoints.

---

## 3. Authentication and Authorization

### Authentication Method: HttpOnly Cookies

The API uses **secure HttpOnly cookies** for authentication, providing protection against XSS attacks. Tokens are never exposed to JavaScript.

| Cookie Name     | Purpose                   | Duration   | Scope          |
| --------------- | ------------------------- | ---------- | -------------- |
| `access_token`  | JWT for API authorization | 15 minutes | `/`            |
| `refresh_token` | JWT for token refresh     | 7 days     | `/api/v1/auth` |

### Authentication Flow (Mandatory 2FA)

Every login requires two steps: credential verification followed by a one-time password (OTP) sent to the user's email.

```
Step 1 — Credentials
┌─────────────┐     POST /auth/login              ┌─────────────┐
│   Client    │ ──────────────────────────────────▶│    API      │
│             │◀──────────────────────────────────│             │
└─────────────┘   { pendingOtp: true, email }      └─────────────┘
                  (no cookies — OTP sent via email)

Step 2 — OTP Verification
┌─────────────┐  POST /auth/verify-login-otp       ┌─────────────┐
│   Client    │ ──────────────────────────────────▶│    API      │
│             │◀──────────────────────────────────│             │
└─────────────┘   Set-Cookie: access_token         └─────────────┘
                  Set-Cookie: refresh_token
                  + user / permissions / backupCodes (first login)

Alternative Step 2 — Backup Code (if OTP unavailable)
┌─────────────┐  POST /auth/verify-backup-code     ┌─────────────┐
│   Client    │ ──────────────────────────────────▶│    API      │
│             │◀──────────────────────────────────│             │
└─────────────┘   Set-Cookie: access_token         └─────────────┘
                  Set-Cookie: refresh_token

┌─────────────┐    GET /any-endpoint               ┌─────────────┐
│   Client    │ ──────────────────────────────────▶│    API      │
│             │   Cookie: access_token             │             │
└─────────────┘                                    └─────────────┘
```

**Backup Codes:** On the very first successful 2FA login, the server generates 10 single-use backup codes and returns them in the response. These codes can be used instead of an OTP if the user cannot access their email. Each code can only be used once.

### Cookie Configuration

```javascript
// Access Token Cookie Options
{
  httpOnly: true,
  secure: true,              // HTTPS only in production
  sameSite: "lax",
  path: "/",
  maxAge: 900000             // 15 minutes in milliseconds
}

// Refresh Token Cookie Options
{
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/api/v1/auth",      // Only sent to auth endpoints
  maxAge: 604800000          // 7 days in milliseconds
}
```

### Token Refresh

When the access token expires, call the refresh endpoint:

```bash
POST /api/v1/auth/refresh
```

The server reads the `refresh_token` cookie, validates that it is still active in server-side session storage, rotates it, and issues a new token pair.

### Logout

```bash
POST /api/v1/auth/logout
```

Revokes the current refresh session on the server and clears both authentication cookies.

### Cache-Control for Authenticated Responses

All authentication responses and authenticated API responses include anti-cache headers to avoid storing sensitive content in browser/proxy caches:

- `Cache-Control: no-store, no-cache, must-revalidate, private`
- `Pragma: no-cache`
- `Expires: 0`

### Role-Based Access Control (RBAC)

| Role                 | Description                             | Key Permissions                                         |
| -------------------- | --------------------------------------- | ------------------------------------------------------- |
| `super_admin`        | Platform owner (software service owner) | Manage subscription types, platform-wide access         |
| `owner`              | Organization administrator              | Full organization access, billing, user management      |
| `manager`            | Operations manager                      | Read/write access to all resources except billing       |
| `warehouse_operator` | Inventory handler                       | Material status updates, inspections, loan checkouts    |
| `commercial_advisor` | Sales representative                    | Customer management, loan requests, read-only materials |

### Permission Examples

```javascript
// Required permissions by resource
{
  "organization": ["organization:read", "organization:update"],
  "users": ["users:create", "users:read", "users:update", "users:delete"],
  "customers": ["customers:create", "customers:read", "customers:update", "customers:delete"],
  "materials": ["materials:create", "materials:read", "materials:update", "materials:delete", "materials:state:update"],
  "loans": ["loans:create", "loans:read", "loans:update", "loans:checkout", "loans:return"],
  "invoices": ["invoices:create", "invoices:read", "invoices:update"],
  "subscription_types": ["subscription_types:create", "subscription_types:read", "subscription_types:update", "subscription_types:delete"]
}
```

---

## 4. Reference Documentation

### Authentication Endpoints

#### POST /auth/register

Registers a new organization with owner account. The account is placed in a **pending email verification** state — no tokens are issued. A 6-digit OTP is emailed to the owner's address and must be confirmed via `POST /auth/verify-email` within **5 minutes**. If the code is not verified in time, all registration data (user, organization, roles) is automatically removed.

| Parameter              | Location | Type   | Required | Description                               |
| ---------------------- | -------- | ------ | -------- | ----------------------------------------- |
| organization.name      | body     | string | Yes      | Organization display name (max 200 chars) |
| organization.legalName | body     | string | Yes      | Legal business name (max 200 chars)       |
| organization.email     | body     | string | Yes      | Organization email (unique)               |
| organization.taxId     | body     | string | No       | Tax identification number                 |
| organization.phone     | body     | string | No       | Phone in E.164 format                     |
| organization.address   | body     | object | No       | Address object (see details below)        |
| owner.name.firstName   | body     | string | Yes      | Owner's first name                        |

The `organization.address` object has the following structure (Colombian address format):

| Field                   | Type   | Required | Description                                                                                           |
| ----------------------- | ------ | -------- | ----------------------------------------------------------------------------------------------------- | ---------------------- |
| streetType              | string | Yes      | One of: Calle, Carrera, Avenida, Avenida Calle, Avenida Carrera, Diagonal, Transversal, Circular, Via |
| primaryNumber           | string | Yes      | Primary street/road number (max 20 chars)                                                             |
| secondaryNumber         | string | Yes      | Cross street number (max 20 chars)                                                                    |
| complementaryNumber     | string | Yes      | Complement identifier, e.g. apartment/office number (max 20 chars)                                    |
| department              | string | Yes      | Colombian department / state (max 100 chars)                                                          |
| city                    | string | Yes      | City name (max 100 chars)                                                                             |
| additionalDetails       | string | No       | Additional free-text details, e.g. "Centro Empresarial, Oficina 602"                                  |
| postalCode              | string | No       | Postal code (max 20 chars)                                                                            |
| owner.name.firstSurname | body   | string   | Yes                                                                                                   | Owner's surname        |
| owner.email             | body   | string   | Yes                                                                                                   | Owner's email (unique) |
| owner.password          | body   | string   | Yes                                                                                                   | Password (min 8 chars) |
| owner.phone             | body   | string   | Yes                                                                                                   | Phone in E.164 format  |

**Response:** `202 Accepted`

```json
{
  "status": "success",
  "message": "Registration successful. Please check your email for a 6-digit verification code to activate your account.",
  "data": {
    "organization": { "id": "...", "name": "...", "email": "..." },
    "user": {
      "id": "...",
      "email": "...",
      "name": { "..." },
      "locations": ["..."]
    }
  }
}
```

**Possible Error Codes (returned in `details.code`):**

- `PENDING_EMAIL_VERIFICATION`: A registration with this email is already pending verification (try again in 5 min).
- `USER_EMAIL_ALREADY_EXISTS`: A verified user with the provided owner email already exists.
- `TAX_ID_ALREADY_EXISTS`: An organization with the provided `taxId` already exists.
- `ORG_EMAIL_ALREADY_EXISTS`: An organization with the provided email already exists.
- `USER_PHONE_ALREADY_EXISTS`: A user with the provided owner phone already exists.
- `ORG_PHONE_ALREADY_EXISTS`: An organization with the provided phone already exists.

---

#### POST /auth/verify-email

Verifies the 6-digit OTP sent to the owner's email during registration. On success the account is activated, authentication cookies are set, and the full profile is returned (identical to the old register `201` response).

**Auth:** None required.

| Parameter | Location | Type   | Required | Description                           |
| --------- | -------- | ------ | -------- | ------------------------------------- |
| email     | body     | string | Yes      | Owner email used during registration  |
| code      | body     | string | Yes      | 6-digit numeric OTP received by email |

**Response:** `201 Created` — Sets `access_token` and `refresh_token` cookies.

```json
{
  "status": "success",
  "message": "Email verified successfully. Your account is now active.",
  "data": {
    "organization": { "id": "...", "name": "...", "email": "..." },
    "user": {
      "id": "...",
      "email": "...",
      "name": { "..." },
      "roleId": "...",
      "roleName": "owner",
      "locations": ["..."],
      "permissions": ["organization:read", "users:create", "users:read"]
    },
    "permissions": ["organization:read", "users:create", "users:read"]
  }
}
```

**Error conditions:**

| Status | Description                                                             |
| ------ | ----------------------------------------------------------------------- |
| 400    | No pending verification found for this email                            |
| 400    | Verification code has expired — registration purged, must re-register   |
| 400    | Invalid verification code (remaining attempt count included in message) |
| 400    | Too many failed attempts — registration purged, must re-register        |

---

#### POST /auth/login

Authenticates user credentials and sends a one-time password (OTP) to the user's email. **Does not issue auth cookies.** The client must complete login by calling `/auth/verify-login-otp` or `/auth/verify-backup-code`.

| Parameter | Location | Type   | Required | Description   |
| --------- | -------- | ------ | -------- | ------------- |
| email     | body     | string | Yes      | User email    |
| password  | body     | string | Yes      | User password |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "pendingOtp": true,
    "email": "user@example.com"
  },
  "message": "OTP sent to your email. Please verify to complete login."
}
```

**Error Responses:**

| Status | Condition                        |
| ------ | -------------------------------- |
| 400    | Missing or invalid fields        |
| 401    | Invalid email or password        |
| 403    | Account deactivated or not found |

---

#### POST /auth/verify-login-otp

Verifies the 6-digit OTP sent to the user's email during login. On success, issues auth cookies and returns user data. On the **first 2FA login**, the response includes 10 single-use backup codes.

| Parameter | Location | Type   | Required | Description                    |
| --------- | -------- | ------ | -------- | ------------------------------ |
| email     | body     | string | Yes      | Email used during login        |
| code      | body     | string | Yes      | 6-digit OTP received via email |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "...",
      "email": "user@example.com",
      "name": { "firstName": "...", "lastName": "..." },
      "roleId": "...",
      "roleName": "owner",
      "locations": ["..."],
      "permissions": ["organization:read", "users:create", "..."]
    },
    "permissions": ["organization:read", "users:create", "..."],
    "backupCodes": ["a1b2c3d4", "e5f6a7b8", "..."]
  }
}
```

> **Note:** `backupCodes` is only present on the first 2FA login. On subsequent logins it is omitted.

**Error Responses:**

| Status | Condition                         | Details                                                            |
| ------ | --------------------------------- | ------------------------------------------------------------------ |
| 400    | Invalid OTP                       | `code: "OTP_INVALID"`, `attemptsLeft: number` (remaining attempts) |
| 400    | OTP expired after 5 minutes       | `code: "OTP_EXPIRED"`                                              |
| 400    | Too many failed attempts (5 max)  | `code: "OTP_MAX_ATTEMPTS"`                                         |
| 400    | No pending OTP verification found | `code: "OTP_NOT_FOUND"`                                            |

---

#### POST /auth/verify-backup-code

Completes login using a single-use backup code instead of the email OTP. Issues auth cookies on success.

| Parameter  | Location | Type   | Required | Description                       |
| ---------- | -------- | ------ | -------- | --------------------------------- |
| email      | body     | string | Yes      | Email used during login           |
| backupCode | body     | string | Yes      | One of the 10 issued backup codes |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "...",
      "email": "user@example.com",
      "name": { "firstName": "...", "lastName": "..." },
      "roleId": "...",
      "roleName": "owner",
      "locations": ["..."],
      "permissions": ["organization:read", "users:create", "..."]
    },
    "permissions": ["organization:read", "users:create", "..."],
    "remainingBackupCodes": 9
  }
}
```

**Error Responses:**

| Status | Condition                                           |
| ------ | --------------------------------------------------- |
| 400    | Invalid or already-used backup code, user not found |

---

#### POST /auth/resend-login-otp

Re-validates credentials and sends a new OTP to the user's email. Use when the original OTP was not received or has expired.

| Parameter | Location | Type   | Required | Description   |
| --------- | -------- | ------ | -------- | ------------- |
| email     | body     | string | Yes      | User email    |
| password  | body     | string | Yes      | User password |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "pendingOtp": true,
    "email": "user@example.com"
  },
  "message": "A new OTP has been sent to your email."
}
```

**Error Responses:**

| Status | Condition                 |
| ------ | ------------------------- |
| 400    | Missing or invalid fields |
| 401    | Invalid credentials       |

---

#### POST /auth/refresh

Refreshes access token using refresh token cookie.

**Request:** No body required. `refresh_token` cookie must be present and active.

**Response:** `200 OK`

```json
{
  "status": "success",
  "message": "Tokens actualizados"
}
```

**Error Responses:**

| Status | Condition |
| ------ | --------- |
| 401    | Missing, expired, revoked, or invalid refresh token |

---

#### POST /auth/logout

Revokes the current refresh session and clears authentication cookies.

**Response:** `200 OK`

```json
{
  "status": "success",
  "message": "Sesión cerrada exitosamente"
}
```

---

#### POST /auth/logout-all

Revokes all active refresh sessions for the authenticated user and clears local auth cookies.

**Auth:** Required (`access_token` cookie)

**Response:** `200 OK`

```json
{
  "status": "success",
  "message": "Todas las sesiones activas fueron cerradas exitosamente"
}
```

**Error Responses:**

| Status | Condition |
| ------ | --------- |
| 401    | Unauthenticated request |

---

#### POST /auth/change-password

Changes the authenticated user's password.

| Parameter       | Location | Type   | Required | Description                |
| --------------- | -------- | ------ | -------- | -------------------------- |
| currentPassword | body     | string | Yes      | Current password           |
| newPassword     | body     | string | Yes      | New password (min 8 chars) |

**Response:** `200 OK`

---

#### POST /auth/forgot-password

Initiates a password reset flow by sending a 6-digit verification code to the user's email.

| Parameter | Location | Type   | Required | Description           |
| --------- | -------- | ------ | -------- | --------------------- |
| email     | body     | string | Yes      | Registered user email |

**Rate Limit:** 3 requests per hour per IP

**Response:** `200 OK`

```json
{
  "status": "success",
  "message": "If an account with that email exists, a verification code has been sent."
}
```

**Notes:**

- Always returns success regardless of whether the email exists (prevents email enumeration)
- The verification code is 6 digits and expires in 10 minutes
- Any previous unused codes for the same user are invalidated

---

#### POST /auth/verify-reset-code

Verifies the 6-digit OTP code sent to the user's email. Returns a reset token required for the final password change.

| Parameter | Location | Type   | Required | Description                        |
| --------- | -------- | ------ | -------- | ---------------------------------- |
| email     | body     | string | Yes      | Email used in forgot-password step |
| code      | body     | string | Yes      | 6-digit verification code          |

**Rate Limit:** 3 requests per hour per IP

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "resetToken": "507f1f77bcf86cd799439015"
  },
  "message": "Code verified successfully. Use the reset token to set a new password."
}
```

**Error Responses:**

| Status | Condition                | Message                                                  |
| ------ | ------------------------ | -------------------------------------------------------- |
| 400    | No reset request found   | No password reset request found for this email           |
| 400    | Code expired             | Verification code has expired. Please request a new one. |
| 400    | Too many failed attempts | Too many failed attempts. Please request a new code.     |
| 400    | Wrong code               | Invalid verification code                                |

**Notes:**

- Maximum 5 verification attempts per code
- After 5 failed attempts, the code is invalidated and a new one must be requested

---

#### POST /auth/reset-password

Resets the user's password using the verified reset token from the previous step.

| Parameter   | Location | Type   | Required | Description                                                      |
| ----------- | -------- | ------ | -------- | ---------------------------------------------------------------- |
| email       | body     | string | Yes      | Email used in previous steps                                     |
| resetToken  | body     | string | Yes      | Token returned by verify-reset-code                              |
| newPassword | body     | string | Yes      | New password (min 8 chars, uppercase, lowercase, digit, special) |

**Rate Limit:** 3 requests per hour per IP

**Password Requirements:**

- Minimum 8 characters, maximum 128 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one special character

**Response:** `200 OK`

```json
{
  "status": "success",
  "message": "Password has been reset successfully. You can now log in with your new password."
}
```

**Error Responses:**

| Status | Condition             | Message                                                                    |
| ------ | --------------------- | -------------------------------------------------------------------------- |
| 400    | Invalid/expired token | Invalid or expired reset token. Please restart the password reset process. |
| 400    | Token expired         | Reset token has expired. Please request a new code.                        |
| 400    | Password too weak     | Password must be at least 8 characters (and other validation rules)        |

---

#### POST /auth/accept-invite

Accepts an organization invitation using the token from the invitation email. Sets the user's password and activates their account.

| Parameter | Location | Type   | Required | Description                                                      |
| --------- | -------- | ------ | -------- | ---------------------------------------------------------------- |
| email     | body     | string | Yes      | Email address the invitation was sent to                         |
| token     | body     | string | Yes      | Invite token from the invitation URL                             |
| password  | body     | string | Yes      | New password (min 8 chars, uppercase, lowercase, digit, special) |

**Authentication Required:** No

**Password Requirements:**

- Minimum 8 characters, maximum 128 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one special character

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439012",
      "email": "jane@eventpro.com",
      "name": { "firstName": "Jane", "firstSurname": "Doe" },
      "role": "commercial_advisor",
      "status": "active"
    }
  },
  "message": "Account activated successfully. You can now log in with your password."
}
```

**Error Responses:**

| Status | Condition                | Message                                                                                 |
| ------ | ------------------------ | --------------------------------------------------------------------------------------- |
| 400    | Invalid or expired token | Invalid or expired invite link. Please ask your administrator to send a new invitation. |
| 400    | Expired token (TTL)      | This invite link has expired. Please ask your administrator to send a new invitation.   |
| 400    | Already activated        | This account has already been activated                                                 |
| 400    | Password too weak        | Password must be at least 8 characters (and other validation rules)                     |
| 404    | User not found           | User account not found                                                                  |

**Notes:**

- Invite links are valid for 48 hours by default (configurable via `INVITE_EXPIRY_HOURS`)
- The frontend should extract `token` and `email` query parameters from the invite URL
- After activation, the user can log in via `POST /auth/login`

---

#### GET /auth/me

Returns current authenticated user's information.

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439012",
      "email": "john@example.com",
      "name": { "firstName": "John", "firstSurname": "Doe" },
      "roleId": "65f0a1b2c3d4e5f607182930",
      "roleName": "owner",
      "status": "active",
      "locations": ["507f1f77bcf86cd799439019"],
      "permissions": ["organization:read", "users:create", "users:read"]
    },
    "permissions": ["organization:read", "users:create", "users:read"]
  }
}
```

---

#### GET /auth/payment-status

Checks if the authenticated user (owner) has an active paid subscription.

**Authentication Required:** Yes

**Permission Required:** Owner role

**Response:** `200 OK` (Active Subscription)

```json
{
  "status": "success",
  "data": {
    "isActive": true,
    "plan": "professional",
    "organizationStatus": "active"
  }
}
```

**Response:** `200 OK` (Inactive/Free Subscription)

```json
{
  "status": "success",
  "data": {
    "isActive": false,
    "plan": "free",
    "organizationStatus": "active"
  }
}
```

**Response:** `403 Forbidden` (Non-Owner User)

```json
{
  "status": "error",
  "message": "Only organization owners can check payment status",
  "code": "FORBIDDEN",
  "data": {
    "isActive": false
  }
}
```

**Notes:**

- Only users with the `owner` role can access this endpoint
- A subscription is considered active (`isActive: true`) when:
  - Organization status is `"active"`
  - Organization has a valid Stripe subscription ID (paid plan)
- Free plan subscriptions will return `isActive: false`

---

### User Management Endpoints

All user endpoints require authentication and active organization.

#### GET /users

Lists all users in the organization.

| Parameter | Location | Type    | Required | Description                                                    |
| --------- | -------- | ------- | -------- | -------------------------------------------------------------- |
| page      | query    | integer | No       | Page number (default: 1)                                       |
| limit     | query    | integer | No       | Items per page (default: 20, max: 100)                         |
| status    | query    | string  | No       | Filter by status: `active`, `inactive`, `invited`, `suspended` |
| roleId    | query    | string  | No       | Filter by role ID                                              |
| search    | query    | string  | No       | Search by name or email                                        |

**Permission Required:** `users:read`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "users": [
      {
        "_id": "60d5ec42f3b14a2c98a5e1a1",
        "name": {
          "firstName": "John",
          "firstSurname": "Doe"
        },
        "email": "john.doe@example.com",
        "roleName": "manager",
        "status": "active"
      }
    ],
    "total": 45,
    "page": 1,
    "totalPages": 3
  }
}
```

---

#### GET /users/:id

Gets a specific user by ID.

| Parameter | Location | Type   | Required | Description           |
| --------- | -------- | ------ | -------- | --------------------- |
| id        | path     | string | Yes      | User MongoDB ObjectId |

**Permission Required:** `users:read`

---

#### POST /users/invite

Invites a new user to the organization. Sends an invitation email with a time-limited link to accept the invite and set a password.

| Parameter          | Location | Type     | Required | Description                                                 |
| ------------------ | -------- | -------- | -------- | ----------------------------------------------------------- |
| name.firstName     | body     | string   | Yes      | First name (max 50 chars)                                   |
| name.secondName    | body     | string   | No       | Middle name / second given name (max 50 chars)              |
| name.firstSurname  | body     | string   | Yes      | First surname (max 50 chars)                                |
| name.secondSurname | body     | string   | No       | Second surname (max 50 chars)                               |
| email              | body     | string   | Yes      | Email address                                               |
| phone              | body     | string   | Yes      | Phone in E.164 format                                       |
| locations          | body     | string[] | Yes      | Array of Organization Location IDs (Mongo ObjectId strings) |
| roleId             | body     | string   | Yes      | Role ID to assign (use `GET /roles` to lookup role IDs)     |

**Permission Required:** `users:create`

**Response:** `201 Created`

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439012",
      "email": "jane@eventpro.com",
      "name": { "firstName": "Jane", "firstSurname": "Doe" },
      "role": "commercial_advisor",
      "status": "invited"
    }
  },
  "message": "User invited successfully. An invitation email has been sent."
}
```

**Notes:**

- An invitation email is sent to the provided email address with a unique link.
- The invite link expires after 48 hours by default (configurable via `INVITE_EXPIRY_HOURS` env var).
- The invited user must click the link and set a password to activate their account via `POST /auth/accept-invite`.
- `locations` must contain valid Location MongoDB ObjectId strings representing organization locations the user will be associated with.
- `roleId` is required and must be a valid role identifier for the organization; the API response returns the resolved role name in the `role` field.

---

#### POST /users/:id/resend-invite

Resends the invitation email for a user still in `invited` status.

| Parameter | Location | Type   | Required | Description           |
| --------- | -------- | ------ | -------- | --------------------- |
| id        | path     | string | Yes      | User MongoDB ObjectId |

**Permission Required:** `users:create`

**Response:** `200 OK`

```json
{
  "status": "success",
  "message": "Invitation email has been resent."
}
```

**Notes:**

- Only users with `invited` status can receive resent invitations
- Previous invite tokens are invalidated and a new one is generated

---

#### PATCH /users/:id

Updates a user's profile.

**Permission Required:** `users:update`

---

#### PATCH /users/:id/role

Updates a user's role (owner only).

| Parameter | Location | Type   | Required | Description |
| --------- | -------- | ------ | -------- | ----------- |
| role      | body     | string | Yes      | New role    |

**Permission Required:** `users:update`

---

#### POST /users/:id/deactivate

Deactivates a user account.

**Permission Required:** `users:delete`

---

#### POST /users/:id/reactivate

Reactivates a user account.

**Permission Required:** `users:update`

---

#### DELETE /users/:id

Permanently deletes a user.

**Permission Required:** `users:delete`

---

---

### Roles Endpoints

The roles API manages organization-scoped roles and permissions. All routes require an authenticated user and an active organization.

**System roles vs. custom roles**

When an organization is registered, four default roles are seeded automatically:

| Role                  | Type     | Read-only | Notes                                 |
| --------------------- | -------- | --------- | ------------------------------------- |
| `Propietario`         | `SYSTEM` | Yes       | Cannot be renamed, edited, or deleted |
| `Gerente`             | `CUSTOM` | No        | Editable default role                 |
| `Operador de almacén` | `CUSTOM` | No        | Editable default role                 |
| `Asesor comercial`    | `CUSTOM` | No        | Editable default role                 |

Roles with `isReadOnly: true` (`type: "SYSTEM"`) are protected at the API level — any attempt to `PATCH` or `DELETE` them returns `403 Forbidden`.

---

#### GET /roles

List roles for the current organization. Supports pagination and sorting (see pagination parameters above).

**Permission Required:** `roles:read`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "items": [
      {
        "_id": "507f1f77bcf86cd799439012",
        "name": "Propietario",
        "permissions": ["organization:read", "users:create"],
        "description": "Propietario de la organización — acceso completo. Rol del sistema, no editable y no eliminable.",
        "isReadOnly": true,
        "type": "SYSTEM"
      },
      {
        "_id": "507f1f77bcf86cd799439013",
        "name": "Gerente",
        "permissions": ["materials:read", "requests:approve"],
        "description": "Rol de gerente predeterminado — puede ser personalizado por el propietario.",
        "isReadOnly": false,
        "type": "CUSTOM"
      }
    ],
    "total": 4,
    "page": 1,
    "limit": 20
  }
}
```

---

#### GET /roles/:id

Get details for a single role within the organization.

| Parameter | Location | Type   | Required | Description           |
| --------- | -------- | ------ | -------- | --------------------- |
| id        | path     | string | Yes      | Role MongoDB ObjectId |

**Permission Required:** `roles:read`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "role": {
      "_id": "507f1f77bcf86cd799439012",
      "name": "Propietario",
      "permissions": ["organization:read", "users:create"],
      "description": "Propietario de la organización — acceso completo. Rol del sistema, no editable y no eliminable.",
      "isReadOnly": true,
      "type": "SYSTEM"
    }
  }
}
```

---

#### POST /roles

Create a new custom role for the current organization.

| Parameter   | Location | Type     | Required | Description                                                              |
| ----------- | -------- | -------- | -------- | ------------------------------------------------------------------------ |
| name        | body     | string   | Yes      | Role name (3–50 chars, any value except `super_admin`)                   |
| permissions | body     | string[] | Yes      | Array of permission strings (use `GET /permissions` to get valid values) |
| description | body     | string   | No       | Human-readable description (max 500)                                     |

**Permission Required:** `roles:create`

**Permission Dependencies Validation:**

Each permission may declare a list of _required_ permissions that must also be included in the same role assignment. The system validates this dependency chain and rejects the request if any dependencies are missing.

**Example:** If you assign `loans:create` to a role, the system will automatically validate that the role also includes `loans:read`, `materials:read`, and `customers:read`. If any are missing, the API returns `400 Bad Request` with a detailed error message listing which dependencies are incomplete.

**Business Logic for Frontend:**

When the frontend allows users to assign permissions to a role, it should:

1. Fetch `GET /permissions` to retrieve all available permissions and their dependency information (the `requires` field).
2. When building the role's permission list in the UI, display the dependency graph so admins understand the "cost" of each permission.
3. On save, let the backend validate the complete dependency chain. If validation fails (400), display the error message to the user explaining which dependencies are missing.
4. Optionally, the UI can pre-emptively add required dependencies when the user selects a permission (auto-include), but **do not auto-include silently**—always show the admin what dependencies are being added.

**Notes:**

- The name `super_admin` is reserved and will be rejected.
- Permissions belonging to the platform `super_admin` role are restricted and cannot be assigned to organization roles.
- Use `GET /permissions` to retrieve the full list of valid, assignable permission identifiers and their dependency information.
- All error communications are in Spanish for organization users.

**Response:** `201 Created`

```json
{
  "status": "success",
  "data": {
    "role": {
      "_id": "507f1f77bcf86cd799439014",
      "name": "auditor",
      "permissions": ["materials:read", "reports:read"],
      "description": "Read-only auditor role",
      "isReadOnly": false,
      "type": "CUSTOM"
    }
  }
}
```

**Error Responses:**

| Status                                                                                                               | Condition                              | Details                                                                   |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------- |
| 400                                                                                                                  | Incomplete permission dependencies     | `Dependencias de permisos incompletas:                                    |
| - El permiso 'loans:create' requiere los siguientes permisos que no están incluidos: materials:read, customers:read` |
| 400                                                                                                                  | Permission restricted to super_admin   | `The following permissions are restricted to the platform super-admin...` |
| 400                                                                                                                  | Role name is 'super_admin'             | `The 'super_admin' role is platform-only...`                              |
| 409                                                                                                                  | Name already taken in the organization | `Role with that name already exists`                                      |

---

#### PATCH /roles/:id

Update an existing custom role. Only provided fields are updated.

| Parameter   | Location | Type     | Required | Description                                     |
| ----------- | -------- | -------- | -------- | ----------------------------------------------- |
| id          | path     | string   | Yes      | Role MongoDB ObjectId                           |
| name        | body     | string   | No       | New role name (cannot be `super_admin`)         |
| permissions | body     | string[] | No       | Updated permissions (no super_admin-only perms) |
| description | body     | string   | No       | Updated description                             |

**Permission Required:** `roles:update`

**Permission Dependencies Validation:**

When updating the `permissions` array, the same dependency validation applies as in `POST /roles`. If the new permission set has incomplete dependencies, the API rejects the update with a detailed error message in Spanish listing all unsatisfied requirements.

**Notes:**

- System roles (`isReadOnly: true`) cannot be modified. Attempting to do so returns `403 Forbidden`.
- If only updating `name` or `description`, permission dependencies are not re-validated (only checked when `permissions` is explicitly provided).

**Error Responses:**

| Status                                                                           | Condition                                  | Message                                                               |
| -------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| 400                                                                              | Incomplete permission dependencies         | `Dependencias de permisos incompletas:                                |
| - El permiso '...' requiere los siguientes permisos que no están incluidos: ...` |
| 403                                                                              | Role is a system role (`isReadOnly: true`) | `The 'owner' role is a system role and cannot be modified or deleted` |
| 404                                                                              | Role not found in organization             | `Role not found`                                                      |
| 409                                                                              | Name already taken in organization         | `Role with that name already exists`                                  |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "role": {
      "_id": "507f1f77bcf86cd799439014",
      "name": "auditor",
      "permissions": ["materials:read"],
      "description": "Updated",
      "isReadOnly": false,
      "type": "CUSTOM"
    }
  }
}
```

---

#### DELETE /roles/:id

Delete a custom role belonging to the current organization.

| Parameter | Location | Type   | Required | Description           |
| --------- | -------- | ------ | -------- | --------------------- |
| id        | path     | string | Yes      | Role MongoDB ObjectId |

**Permission Required:** `roles:delete`

**Notes:**

- System roles (`isReadOnly: true`) — including the seeded `owner` role — cannot be deleted. Attempting to do so returns `403 Forbidden`. This ensures every organization always retains at least one owner role.

**Error Responses:**

| Status | Condition                                  | Message                                                               |
| ------ | ------------------------------------------ | --------------------------------------------------------------------- |
| 403    | Role is a system role (`isReadOnly: true`) | `The 'owner' role is a system role and cannot be modified or deleted` |
| 404    | Role not found in organization             | `Role not found`                                                      |

**Response:** `200 OK`

```json
{
  "status": "success",
  "message": "Role deleted successfully"
}
```

---

---

### Permissions

The permissions endpoint serves the system's permission catalogue directly from the canonical `permissions.json` definitions file (no DB round-trip). It is intended for UI role editors so consumers can build a labelled, categorised permission picker without hard-coding permission strings on the client.

**Platform-only permissions are excluded by default** — only permissions assignable to organization roles are returned unless `includePlatform=true` is provided.

#### GET /permissions

Returns the permission catalogue with optional filtering and grouping.

**Authentication Required:** Yes

**Active Organization Required:** Yes

**Permission Required:** `permissions:read`

| Parameter       | Location | Type    | Required | Description                                                                                    |
| --------------- | -------- | ------- | -------- | ---------------------------------------------------------------------------------------------- |
| category        | query    | string  | No       | Filter to a single category (e.g. `Transfers`, `Materials`, `Roles`)                           |
| includePlatform | query    | boolean | No       | When `true`, includes platform-only permissions (default: `false`)                             |
| grouped         | query    | boolean | No       | When `true`, returns permissions grouped by category instead of a flat list (default: `false`) |

**Flat response** (`GET /permissions`):

```json
{
  "status": "success",
  "data": [
    {
      "id": "customers:create",
      "displayName": "Create Customers",
      "description": "Allows registering new customers/clients in the system.",
      "category": "Customers",
      "isPlatformPermission": false
    },
    {
      "id": "materials:read",
      "displayName": "View Materials",
      "description": "Allows browsing the inventory and material catalog.",
      "category": "Materials",
      "isPlatformPermission": false
    }
  ]
}
```

**Grouped response** (`GET /permissions?grouped=true`):

```json
{
  "status": "success",
  "data": [
    {
      "category": "Customers",
      "permissions": [
        {
          "id": "customers:create",
          "displayName": "Create Customers",
          "description": "Allows registering new customers/clients in the system.",
          "category": "Customers",
          "isPlatformPermission": false
        }
      ]
    },
    {
      "category": "Materials",
      "permissions": [
        {
          "id": "materials:read",
          "displayName": "View Materials",
          "description": "Allows browsing the inventory and material catalog.",
          "category": "Materials",
          "isPlatformPermission": false
        }
      ]
    }
  ]
}
```

**Response fields per permission object:**

| Field                  | Type     | Description                                                                                                                                                                                                        |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                   | string   | Permission identifier in `resource:action` format                                                                                                                                                                  |
| `displayName`          | string   | Human-readable label for UI display                                                                                                                                                                                |
| `description`          | string   | Short description of what granting this permission does                                                                                                                                                            |
| `category`             | string   | Grouping category (e.g. `Materials`, `Roles`, `Transfers`)                                                                                                                                                         |
| `isPlatformPermission` | boolean  | Whether this is a platform-only (super-admin) permission                                                                                                                                                           |
| `requires`             | string[] | **NEW** — Array of permission IDs that must also be assigned to grant this permission. Empty array if no dependencies. Example: `loans:create` has `requires: ["loans:read", "materials:read", "customers:read"]`. |

**Permission Dependencies — Frontend Implementation Guide:**

The `requires` field establishes a **functional dependency chain**. This ensures that permissions do not grant incomplete capabilities:

- **Cross-resource dependencies:** Assigning `loans:create` requires `materials:read` and `customers:read` because loan creation needs to lookup both resources.
- **Same-resource dependencies:** Most `create` operations require the corresponding `read` permission (e.g., `users:create` → `users:read`) so the UI can display listings after creation.
- **Operational dependencies:** Complex operations like `requests:assign` require `materials:read` to allow inventory picking.

**Frontend Implementation Recommendations:**

1. **Fetch permissions with metadata:**

   ```bash
   GET /permissions
   ```

   Cache the response locally so you have the full `requires[]` data for every permission.

2. **Display permission dependencies in the role editor UI:**
   - When the user clicks on a permission, show a tooltip or expandable section listing its dependencies.
   - Example: `loans:create` → depends on: `loans:read`, `materials:read`, `customers:read`

3. **Handle the 400 validation error gracefully:**

   ```javascript
   // When POST /roles or PATCH /roles/:id returns 400:
   // Error message example:
   // "Dependencias de permisos incompletas:
   // - El permiso 'loans:create' requiere los siguientes permisos que no están incluidos: materials:read, customers:read"

   // Display to the admin with suggestions to add the missing permissions.
   ```

4. **Optional auto-include of dependencies:**
   - When the admin selects a permission, you may **optionally** auto-add its dependencies (but show what's being added).
   - This prevents the frustration of seeing a 400 validation error, but the admin must be able to undo/customize the selection.

**Example: Permission with dependencies**

```json
{
  "id": "loans:create",
  "displayName": "Create Loans",
  "description": "Allows initiating new material loan records.",
  "category": "Loans",
  "isPlatformPermission": false,
  "requires": ["loans:read", "materials:read", "customers:read"]
}
```

**Example: Permission with no dependencies**

```json
{
  "id": "loans:read",
  "displayName": "View Loans",
  "description": "Allows viewing active and historical loan records.",
  "category": "Loans",
  "isPlatformPermission": false,
  "requires": []
}
```

---

### Organization Endpoints

#### GET /organizations

Gets the current organization's details.

**Permission Required:** `organization:read`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "organization": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "EventPro Rentals",
      "legalName": "EventPro Rentals LLC",
      "email": "admin@eventpro.com",
      "status": "active",
      "subscription": {
        "plan": "professional",
        "seatCount": 5,
        "catalogItemCount": 45,
        "currentPeriodEnd": "2026-03-01T00:00:00.000Z"
      }
    }
  }
}
```

---

#### PATCH /organizations

Updates the organization's details.

**Permission Required:** `organization:update`

---

#### GET /organizations/usage

Gets current plan usage and limits.

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "usage": {
      "currentCatalogItems": 45,
      "maxCatalogItems": 500,
      "currentSeats": 5,
      "maxSeats": 20,
      "canAddCatalogItem": true,
      "canAddSeat": true
    }
  }
}
```

---

#### GET /organizations/plans

Gets available subscription plans.

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "plans": [
      {
        "name": "free",
        "displayName": "Free",
        "billingModel": "fixed",
        "maxCatalogItems": 10,
        "maxSeats": 1,
        "features": ["Basic catalog management", "Single user"],
        "basePriceMonthly": 0,
        "pricePerSeat": 0
      },
      {
        "name": "professional",
        "displayName": "Professional",
        "billingModel": "dynamic",
        "maxCatalogItems": 500,
        "maxSeats": 20,
        "features": [
          "Up to 20 team members",
          "500 catalog items",
          "Priority support"
        ],
        "basePriceMonthly": 99,
        "pricePerSeat": 4
      }
    ]
  }
}
```

---

#### GET /organizations/settings

Gets the current organization's policy settings.

**Auth:** `authenticate` + `requirePermission("organization:read")`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "settings": {
      "damageDueDays": 30,
      "requireFullPaymentBeforeCheckout": false
    }
  }
}
```

**Settings reference:**

| Field                              | Type    | Default | Description                                                                                                      |
| ---------------------------------- | ------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `damageDueDays`                    | integer | `30`    | Number of days after inspection to set as the due date for damage invoices (1–365).                              |
| `requireFullPaymentBeforeCheckout` | boolean | `false` | When `true`, `POST /loans/from-request/:requestId` will reject checkout unless the rental fee has been recorded. |

---

#### PATCH /organizations/settings

Updates the organization's policy settings. Only the fields provided in the body are updated; omitted fields remain unchanged.

**Auth:** `authenticate` + `requirePermission("organization:update")`

| Parameter                        | Location | Type    | Required | Description                                    |
| -------------------------------- | -------- | ------- | -------- | ---------------------------------------------- |
| damageDueDays                    | body     | integer | No       | Damage invoice due-date window in days (1–365) |
| requireFullPaymentBeforeCheckout | body     | boolean | No       | Require rental fee payment before checkout     |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "settings": {
      "damageDueDays": 15,
      "requireFullPaymentBeforeCheckout": true
    }
  }
}
```

**Errors:**

| Code              | Condition                                             |
| ----------------- | ----------------------------------------------------- |
| `400 BAD_REQUEST` | Validation error (e.g., `damageDueDays` out of range) |
| `404 NOT_FOUND`   | Organization not found                                |

---

### Subscription Type Endpoints (Super Admin)

The subscription type module allows the platform owner to manage plan configurations dynamically.

#### GET /subscription-types

Lists all active subscription types (public).

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "subscriptionTypes": [
      {
        "plan": "starter",
        "displayName": "Starter",
        "billingModel": "dynamic",
        "maxCatalogItems": 100,
        "maxSeats": 5,
        "durationDays": 30,
        "features": ["Up to 5 team members", "100 catalog items"],
        "basePriceMonthly": 29,
        "pricePerSeat": 5
      }
    ]
  }
}
```

---

#### GET /subscription-types/:plan

Gets a specific subscription type by plan name.

| Parameter | Location | Type   | Required | Description                                       |
| --------- | -------- | ------ | -------- | ------------------------------------------------- |
| plan      | path     | string | Yes      | Plan identifier (e.g., `starter`, `professional`) |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "subscriptionType": {
      "plan": "starter",
      "displayName": "Starter",
      "billingModel": "dynamic",
      "maxCatalogItems": 100,
      "maxSeats": 5,
      "durationDays": 30,
      "features": ["Up to 5 team members", "100 catalog items"],
      "basePriceMonthly": 29,
      "pricePerSeat": 5
    }
  }
}
```

---

#### POST /subscription-types

Creates a new subscription type (super admin only).

| Parameter         | Location | Type     | Required | Description                                        |
| ----------------- | -------- | -------- | -------- | -------------------------------------------------- |
| plan              | body     | string   | Yes      | Unique plan identifier (alphanumeric + underscore) |
| displayName       | body     | string   | Yes      | Human-readable name                                |
| description       | body     | string   | No       | Description (max 500 chars)                        |
| billingModel      | body     | string   | Yes      | `fixed` or `dynamic`                               |
| baseCost          | body     | integer  | Yes      | Base cost in cents                                 |
| pricePerSeat      | body     | integer  | Yes      | Price per seat in cents                            |
| maxSeats          | body     | integer  | No       | Max seats (-1 = unlimited, default: -1)            |
| maxCatalogItems   | body     | integer  | No       | Max items (-1 = unlimited, default: -1)            |
| durationDays      | body     | integer  | Yes      | Subscription period in days (min: 1, max: 365)     |
| features          | body     | string[] | No       | List of feature descriptions                       |
| sortOrder         | body     | integer  | No       | Display order (default: 0)                         |
| stripePriceIdBase | body     | string   | No       | Stripe price ID for base                           |
| stripePriceIdSeat | body     | string   | No       | Stripe price ID for seats                          |
| status            | body     | string   | No       | `active`, `inactive`, `deprecated`                 |

**Permission Required:** `subscription_types:create` (super_admin role)

**Response:** `201 Created`

```json
{
  "status": "success",
  "data": {
    "subscriptionType": {
      "_id": "507f1f77bcf86cd799439013",
      "plan": "custom_enterprise",
      "displayName": "Custom Enterprise",
      "billingModel": "dynamic",
      "baseCost": 49900,
      "pricePerSeat": 200,
      "maxSeats": -1,
      "maxCatalogItems": -1,
      "durationDays": 365,
      "features": ["Unlimited everything", "24/7 support"],
      "status": "active"
    }
  }
}
```

---

#### PATCH /subscription-types/:plan

Updates a subscription type (super admin only).

**Note:** The `plan` field cannot be changed after creation. `durationDays` can be updated but must remain within 1–365.

**Permission Required:** `subscription_types:update`

---

#### DELETE /subscription-types/:plan

Deactivates a subscription type (soft delete).

**Permission Required:** `subscription_types:delete`

**Response:** `200 OK`

```json
{
  "status": "success",
  "message": "Subscription type \"custom_enterprise\" has been deactivated"
}
```

---

#### POST /subscription-types/:plan/calculate-cost

Calculates the cost for a plan with a given seat count.

| Parameter | Location | Type    | Required | Description     |
| --------- | -------- | ------- | -------- | --------------- |
| plan      | path     | string  | Yes      | Plan identifier |
| seatCount | body     | integer | Yes      | Number of seats |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "plan": "professional",
    "seatCount": 10,
    "baseCost": 99,
    "seatCost": 40,
    "totalCost": 139,
    "currency": "usd"
  }
}
```

---

### Billing Endpoints

#### POST /billing/checkout

Creates a Stripe Checkout session for subscription.

| Parameter  | Location | Type    | Required | Description                                              |
| ---------- | -------- | ------- | -------- | -------------------------------------------------------- |
| plan       | body     | string  | Yes      | Plan name (e.g. `starter`, `professional`, `enterprise`) |
| seatCount  | body     | integer | No       | Number of seats (default: 1, min: 1)                     |
| successUrl | body     | string  | Yes      | URL to redirect on success                               |
| cancelUrl  | body     | string  | Yes      | URL to redirect on cancel                                |

**Permission Required:** `billing:manage`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "checkoutUrl": "https://checkout.stripe.com/pay/..."
  }
}
```

**Error Conditions:**

| Status | Condition                                        |
| ------ | ------------------------------------------------ |
| 400    | Plan is `free`, does not exist, or is not active |
| 400    | Seat count invalid for the plan                  |
| 409    | Organization already has an active subscription  |

---

#### POST /billing/portal

Creates a Stripe Billing Portal session.

| Parameter | Location | Type   | Required | Description                   |
| --------- | -------- | ------ | -------- | ----------------------------- |
| returnUrl | body     | string | Yes      | URL to return to after portal |

**Permission Required:** `billing:manage`

---

#### PATCH /billing/seats

Updates the subscription seat quantity.

| Parameter | Location | Type    | Required | Description    |
| --------- | -------- | ------- | -------- | -------------- |
| seatCount | body     | integer | Yes      | New seat count |

**Permission Required:** `billing:manage`

---

#### POST /billing/cancel

Cancels the subscription.

| Parameter         | Location | Type    | Required | Description                                  |
| ----------------- | -------- | ------- | -------- | -------------------------------------------- |
| cancelImmediately | body     | boolean | No       | Cancel now or at period end (default: false) |

**Permission Required:** `billing:manage`

---

#### POST /billing/change-plan

Changes the subscription plan. Upgrades are applied immediately with Stripe proration. Downgrades are deferred to the end of the current billing period via Stripe Subscription Schedules.

| Parameter | Location | Type    | Required | Description                                     |
| --------- | -------- | ------- | -------- | ----------------------------------------------- |
| plan      | body     | string  | Yes      | New plan name (e.g. `starter`, `professional`)  |
| seatCount | body     | integer | No       | New seat count (defaults to current seat count) |

**Permission Required:** `billing:manage`  
**Requires:** Active organization with an active subscription.

**Response (upgrade):** `200 OK`

```json
{
  "status": "success",
  "data": {
    "type": "upgrade",
    "effectiveDate": "immediate",
    "previousPlan": "starter",
    "newPlan": "professional"
  }
}
```

**Response (downgrade):** `200 OK`

```json
{
  "status": "success",
  "data": {
    "type": "downgrade",
    "effectiveDate": "2026-05-08T00:00:00.000Z",
    "previousPlan": "professional",
    "newPlan": "starter"
  }
}
```

**Error Conditions:**

| Status | Condition                                     |
| ------ | --------------------------------------------- |
| 400    | No active subscription                        |
| 400    | Same plan requested (`Ya estás en este plan`) |
| 400    | Plan does not exist or is not active          |
| 400    | Invalid seat count for the target plan        |

---

#### GET /billing/pending-changes

Gets pending plan change information (scheduled downgrades).

**Permission Required:** `billing:manage`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "pendingChange": {
      "pendingPlan": "starter",
      "effectiveDate": "2026-05-08T00:00:00.000Z"
    }
  }
}
```

Returns `null` for `pendingChange` if no pending plan change exists.

---

#### DELETE /billing/pending-changes

Cancels a pending plan change (deferred downgrade). Releases the Stripe Subscription Schedule, keeping the current subscription as-is.

**Permission Required:** `billing:manage`

**Response:** `200 OK`

```json
{
  "status": "success",
  "message": "Cambio de plan pendiente cancelado exitosamente"
}
```

**Error Conditions:**

| Status | Condition                        |
| ------ | -------------------------------- |
| 400    | No pending plan change to cancel |

---

#### GET /billing/history

Gets billing history for the organization.

| Parameter | Location | Type    | Required | Description             |
| --------- | -------- | ------- | -------- | ----------------------- |
| limit     | query    | integer | No       | Max items (default: 50) |

**Permission Required:** `billing:manage`

---

#### POST /billing/webhook

Handles Stripe webhook events. This endpoint receives raw body for signature verification.

---

### Admin Analytics Endpoints (Super Admin Only)

All admin analytics endpoints require `super_admin` role. These endpoints return **aggregated, non-PII data only** — no organization names, user emails, or other personally identifiable information.

#### GET /admin/analytics/overview

Gets high-level platform statistics.

**Permission Required:** `super_admin` role

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "overview": {
      "totalOrganizations": 150,
      "activeOrganizations": 142,
      "suspendedOrganizations": 8,
      "totalUsers": 523,
      "activeUsers": 498,
      "monthlyRecurringRevenue": 12500.0,
      "totalLoansProcessed": 8250,
      "totalInvoicesGenerated": 7890
    }
  }
}
```

---

#### GET /admin/analytics/organizations

Gets aggregated organization activity statistics.

| Parameter    | Location | Type    | Required | Description                       |
| ------------ | -------- | ------- | -------- | --------------------------------- |
| periodMonths | query    | integer | No       | Trend period months (default: 12) |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "periodMonths": 12,
    "stats": {
      "byStatus": [
        { "status": "active", "count": 142 },
        { "status": "suspended", "count": 8 }
      ],
      "byPlan": [
        { "plan": "starter", "count": 80 },
        { "plan": "professional", "count": 50 },
        { "plan": "enterprise", "count": 12 },
        { "plan": "free", "count": 8 }
      ],
      "growthTrend": [
        { "period": "2025-06", "newOrganizations": 8 },
        { "period": "2025-07", "newOrganizations": 12 }
      ],
      "averageSeatCount": 3.2,
      "averageCatalogItemCount": 45.8
    }
  }
}
```

---

#### GET /admin/analytics/organizations-pii

Gets a paginated list of all organizations with their details.

| Parameter | Location | Type    | Required | Description                  |
| --------- | -------- | ------- | -------- | ---------------------------- |
| page      | query    | integer | No       | Page number (default: 1)     |
| limit     | query    | integer | No       | Items per page (default: 10) |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "organizations": [
      {
        "_id": "60d5f1b4e6b3f10015f1b3a0",
        "name": "Innovate Inc.",
        "legalName": "Innovate Inc. LLC",
        "email": "contact@innovate.com",
        "phone": "+1234567890",
        "address": {
          "streetType": "Calle",
          "primaryNumber": "123",
          "secondaryNumber": "10",
          "complementaryNumber": "5",
          "department": "Cundinamarca",
          "city": "Bogotá"
        },
        "subscription": {
          "plan": "professional",
          "seatCount": 10,
          "stripeCustomerId": "cus_12345",
          "stripeSubscriptionId": "sub_12345"
        },
        "status": "active",
        "createdAt": "2023-01-15T10:30:00.000Z"
      }
    ],
    "total": 150,
    "page": 1,
    "limit": 10,
    "totalPages": 15
  }
}
```

---

#### GET /admin/analytics/users

Gets aggregated user activity statistics.

| Parameter    | Location | Type    | Required | Description                       |
| ------------ | -------- | ------- | -------- | --------------------------------- |
| periodMonths | query    | integer | No       | Trend period months (default: 12) |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "periodMonths": 12,
    "stats": {
      "byRole": [
        { "role": "owner", "count": 150 },
        { "role": "manager", "count": 120 },
        { "role": "commercial_advisor", "count": 180 },
        { "role": "warehouse_operator", "count": 73 }
      ],
      "byStatus": [
        { "status": "active", "count": 498 },
        { "status": "pending_activation", "count": 15 },
        { "status": "inactive", "count": 10 }
      ],
      "growthTrend": [
        { "period": "2025-06", "newUsers": 25 },
        { "period": "2025-07", "newUsers": 32 }
      ],
      "averageUsersPerOrganization": 3.5
    }
  }
}
```

---

#### GET /admin/analytics/revenue

Gets revenue statistics and trends.

| Parameter    | Location | Type    | Required | Description                       |
| ------------ | -------- | ------- | -------- | --------------------------------- |
| periodMonths | query    | integer | No       | Trend period months (default: 12) |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "periodMonths": 12,
    "stats": {
      "totalRevenue": 150000.0,
      "revenueByPlan": [
        { "plan": "professional", "revenue": 75000.0, "organizationCount": 50 },
        { "plan": "starter", "revenue": 40000.0, "organizationCount": 80 },
        { "plan": "enterprise", "revenue": 35000.0, "organizationCount": 12 }
      ],
      "monthlyTrend": [
        { "period": "2025-06", "revenue": 11500.0 },
        { "period": "2025-07", "revenue": 12500.0 }
      ],
      "averageRevenuePerOrganization": 1000.0
    }
  }
}
```

---

#### GET /admin/analytics/subscriptions

Gets subscription distribution and churn metrics.

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "stats": {
      "totalActiveSubscriptions": 142,
      "subscriptionsByPlan": [
        { "plan": "starter", "count": 80, "percentage": 53.3 },
        { "plan": "professional", "count": 50, "percentage": 33.3 },
        { "plan": "enterprise", "count": 12, "percentage": 8.0 },
        { "plan": "free", "count": 8, "percentage": 5.3 }
      ],
      "churnRate": 2.5,
      "upgrades": 5,
      "downgrades": 2
    }
  }
}
```

---

#### GET /admin/analytics/health

Gets platform health metrics (overdue items, payment failures).

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "health": {
      "overdueLoans": 12,
      "overdueInvoices": 8,
      "suspendedOrganizations": 8,
      "recentErrors": 3
    }
  }
}
```

---

#### GET /admin/analytics/activity

Gets recent platform billing activity (non-PII event log).

| Parameter | Location | Type    | Required | Description                      |
| --------- | -------- | ------- | -------- | -------------------------------- |
| limit     | query    | integer | No       | Max items (default: 50, max 100) |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "activity": [
      {
        "eventType": "payment_succeeded",
        "timestamp": "2025-07-15T10:30:00Z",
        "amount": 99.0
      },
      {
        "eventType": "plan_upgraded",
        "timestamp": "2025-07-15T09:15:00Z",
        "plan": "professional"
      }
    ]
  }
}
```

---

#### GET /admin/analytics/dashboard

Gets all analytics in a single call for dashboard rendering.

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "overview": {
      /* platform overview */
    },
    "organizationStats": {
      /* organization activity */
    },
    "userStats": {
      /* user activity */
    },
    "subscriptionStats": {
      /* subscription metrics */
    },
    "health": {
      /* health metrics */
    },
    "generatedAt": "2025-07-15T10:35:00Z"
  }
}
```

---

### Admin Export Endpoints (Super Admin Only)

All admin export endpoints require `super_admin` role. They follow the `includeIds` toggle pattern:

- `includeIds=true` (default) → detailed data rows with identifiers (org IDs, org names, plan, status — **no** sensitive PII like emails, phones, or addresses).
- `includeIds=false` → aggregated summary with enriched metrics and `periodComparison` when date range is provided.

---

#### GET /admin/exports/platform-kpis

Platform-wide KPIs: organization/user growth, loans, invoices, MRR/ARR.

**Permission Required:** `super_admin` role

**Query Parameters:**

| Name       | Type    | Required | Description                                                                    |
| ---------- | ------- | -------- | ------------------------------------------------------------------------------ |
| startDate  | string  | No       | ISO date — filter records created on or after                                  |
| endDate    | string  | No       | ISO date — filter records created on or before                                 |
| includeIds | boolean | No       | `true` (default) returns monthly breakdown; `false` returns aggregated summary |

**Response (includeIds=true):** `200 OK`

```json
{
  "status": "success",
  "data": {
    "monthlyBreakdown": [
      {
        "year": 2025,
        "month": 1,
        "newOrgs": 12,
        "newUsers": 45,
        "totalLoans": 320,
        "totalInvoices": 280
      }
    ],
    "generatedAt": "2025-07-15T12:00:00.000Z"
  }
}
```

**Response (includeIds=false):** `200 OK`

```json
{
  "status": "success",
  "data": {
    "summary": {
      "currentKpis": {
        "totalOrgs": 150,
        "activeOrgs": 142,
        "totalUsers": 523,
        "activeUsers": 498,
        "totalLoans": 8250,
        "totalInvoices": 7890,
        "mrr": 12500.0,
        "arr": 150000.0
      },
      "avgUsersPerOrg": 3.49,
      "avgSeatsPerOrg": 4.2,
      "avgCatalogItemsPerOrg": 38.5,
      "orgsByStatus": { "active": 142, "suspended": 5, "cancelled": 3 },
      "usersByStatus": { "active": 498, "inactive": 15, "pending": 10 },
      "periodComparison": {
        "previous": {
          "orgs": 130,
          "users": 450,
          "loans": 7000,
          "invoices": 6500
        },
        "current": {
          "orgs": 150,
          "users": 523,
          "loans": 8250,
          "invoices": 7890
        },
        "changes": {
          "orgs": 15.38,
          "users": 16.22,
          "loans": 17.86,
          "invoices": 21.38
        }
      }
    },
    "generatedAt": "2025-07-15T12:00:00.000Z"
  }
}
```

---

#### GET /admin/exports/subscriptions

Subscription analytics: plan distribution, churn, upgrades/downgrades, payment success rate.

**Permission Required:** `super_admin` role

**Query Parameters:**

| Name       | Type    | Required | Description                                                                       |
| ---------- | ------- | -------- | --------------------------------------------------------------------------------- |
| startDate  | string  | No       | ISO date — filter by organization creation date                                   |
| endDate    | string  | No       | ISO date — filter by organization creation date                                   |
| plan       | string  | No       | Filter by subscription plan (e.g., `starter`)                                     |
| orgStatus  | string  | No       | Filter by org status: `active`, `suspended`, `cancelled`                          |
| page       | number  | No       | Page number (default: 1) — only for includeIds=true                               |
| limit      | number  | No       | Page size 1–200 (default: 50) — only for includeIds=true                          |
| includeIds | boolean | No       | `true` (default) returns paginated org list; `false` returns aggregated analytics |

**Response (includeIds=true):** `200 OK`

```json
{
  "status": "success",
  "data": {
    "subscriptions": [
      {
        "orgId": "6650...",
        "orgName": "Acme Corp",
        "orgStatus": "active",
        "plan": "professional",
        "seatCount": 5,
        "catalogItemCount": 120,
        "currentPeriodStart": "2025-07-01T00:00:00.000Z",
        "currentPeriodEnd": "2025-07-31T23:59:59.000Z",
        "cancelAtPeriodEnd": false,
        "pendingPlan": null,
        "orgCreatedAt": "2024-03-15T10:00:00.000Z"
      }
    ],
    "total": 150,
    "page": 1,
    "limit": 50,
    "totalPages": 3,
    "generatedAt": "2025-07-15T12:00:00.000Z"
  }
}
```

**Response (includeIds=false):** `200 OK`

```json
{
  "status": "success",
  "data": {
    "summary": {
      "totalOrgs": 150,
      "byPlan": [
        {
          "plan": "free",
          "count": 30,
          "percentage": 20.0,
          "estimatedMonthlyRevenue": 0
        },
        {
          "plan": "starter",
          "count": 50,
          "percentage": 33.33,
          "estimatedMonthlyRevenue": 1450
        },
        {
          "plan": "professional",
          "count": 60,
          "percentage": 40.0,
          "estimatedMonthlyRevenue": 5940
        },
        {
          "plan": "enterprise",
          "count": 10,
          "percentage": 6.67,
          "estimatedMonthlyRevenue": 2990
        }
      ],
      "byOrgStatus": [
        { "status": "active", "count": 142 },
        { "status": "suspended", "count": 5 },
        { "status": "cancelled", "count": 3 }
      ],
      "churn": 3,
      "upgrades": 12,
      "downgrades": 2,
      "paymentAnalytics": {
        "succeeded": 280,
        "failed": 5,
        "successRate": 98.25
      },
      "topPlanByCount": { "plan": "professional", "count": 60 },
      "topPlanByRevenue": { "plan": "professional", "revenue": 5940 },
      "periodComparison": {
        "previous": { "orgs": 130, "churn": 2, "upgrades": 8, "downgrades": 1 },
        "current": { "orgs": 150, "churn": 3, "upgrades": 12, "downgrades": 2 },
        "changes": {
          "orgs": 15.38,
          "churn": 50.0,
          "upgrades": 50.0,
          "downgrades": 100.0
        }
      }
    },
    "generatedAt": "2025-07-15T12:00:00.000Z"
  }
}
```

---

#### GET /admin/exports/usage

Platform usage metrics per organization: loans, users, materials, invoices, customers, locations.

**Permission Required:** `super_admin` role

**Query Parameters:**

| Name       | Type    | Required | Description                                                                               |
| ---------- | ------- | -------- | ----------------------------------------------------------------------------------------- |
| startDate  | string  | No       | ISO date — filter time-based counts (loans, invoices, customers)                          |
| endDate    | string  | No       | ISO date — filter time-based counts                                                       |
| plan       | string  | No       | Filter orgs by subscription plan                                                          |
| orgStatus  | string  | No       | Filter by org status: `active`, `suspended`, `cancelled`                                  |
| page       | number  | No       | Page number (default: 1) — only for includeIds=true                                       |
| limit      | number  | No       | Page size 1–200 (default: 50) — only for includeIds=true                                  |
| includeIds | boolean | No       | `true` (default) returns paginated per-org rows; `false` returns platform-wide aggregates |

**Response (includeIds=true):** `200 OK`

```json
{
  "status": "success",
  "data": {
    "organizations": [
      {
        "orgId": "6650...",
        "orgName": "Acme Corp",
        "plan": "professional",
        "orgStatus": "active",
        "userCount": 8,
        "activeUserCount": 7,
        "loanCount": 250,
        "invoiceCount": 220,
        "customerCount": 45,
        "locationCount": 3,
        "materialTypeCount": 15,
        "materialInstanceCount": 180,
        "createdAt": "2024-03-15T10:00:00.000Z"
      }
    ],
    "total": 150,
    "page": 1,
    "limit": 50,
    "totalPages": 3,
    "generatedAt": "2025-07-15T12:00:00.000Z"
  }
}
```

**Response (includeIds=false):** `200 OK`

```json
{
  "status": "success",
  "data": {
    "summary": {
      "platformTotals": {
        "organizations": 150,
        "users": 523,
        "loans": 8250,
        "invoices": 7890,
        "customers": 3200,
        "locations": 45,
        "materialTypes": 890,
        "materialInstances": 12500
      },
      "avgPerOrg": {
        "users": 3.49,
        "loans": 55.0,
        "invoices": 52.6,
        "customers": 21.33
      },
      "topByLoans": [
        { "orgName": "Acme Corp", "plan": "professional", "count": 520 }
      ],
      "topByInvoices": [
        { "orgName": "Acme Corp", "plan": "professional", "count": 480 }
      ],
      "topByUsers": [
        { "orgName": "Acme Corp", "plan": "professional", "count": 15 }
      ],
      "usageDistribution": [
        { "bucket": "0", "orgCount": 5 },
        { "bucket": "1-10", "orgCount": 20 },
        { "bucket": "11-50", "orgCount": 45 },
        { "bucket": "51-200", "orgCount": 60 },
        { "bucket": "201+", "orgCount": 20 }
      ],
      "periodComparison": {
        "previous": {
          "loans": 7000,
          "invoices": 6500,
          "users": 450,
          "customers": 2800
        },
        "current": {
          "loans": 8250,
          "invoices": 7890,
          "users": 523,
          "customers": 3200
        },
        "changes": {
          "loans": 17.86,
          "invoices": 21.38,
          "users": 16.22,
          "customers": 14.29
        }
      }
    },
    "generatedAt": "2025-07-15T12:00:00.000Z"
  }
}
```

---

### Customer Endpoints

#### GET /customers/document-types

Gets all valid document types with their display names.

**Authentication Required:** Yes

**Permission Required:** None (available to all authenticated users)

**Example Request:**

```bash
curl -X GET https://api.test.local/api/v1/customers/document-types \
  -b cookies.txt
```

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "documentTypes": [
      {
        "value": "cc",
        "displayName": "Cédula de Ciudadanía",
        "description": "Colombian National ID"
      },
      {
        "value": "ce",
        "displayName": "Cédula de Extranjería",
        "description": "Colombian Foreign ID"
      },
      {
        "value": "passport",
        "displayName": "Passport",
        "description": "International Passport"
      },
      {
        "value": "nit",
        "displayName": "NIT",
        "description": "Tax Identification Number"
      },
      {
        "value": "other",
        "displayName": "Other",
        "description": "Other identification type"
      }
    ]
  }
}
```

**Notes:**

- This endpoint provides reference data for customer document types
- Use the `value` field when creating or updating customers
- The `displayName` field should be used in user interfaces

---

#### GET /customers

Lists all customers in the organization.

| Parameter | Location | Type    | Required | Description                         |
| --------- | -------- | ------- | -------- | ----------------------------------- |
| page      | query    | integer | No       | Page number                         |
| limit     | query    | integer | No       | Items per page                      |
| status    | query    | string  | No       | `active`, `inactive`, `blacklisted` |
| search    | query    | string  | No       | Search by name, email, or document  |

**Permission Required:** `customers:read`

---

#### GET /customers/:id

Gets a specific customer by ID.

| Parameter | Location | Type   | Required | Description |
| --------- | -------- | ------ | -------- | ----------- |
| id        | path     | string | Yes      | Customer ID |

**Permission Required:** `customers:read`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "customer": {
      "_id": "507f1f77bcf86cd799439011",
      "organizationId": "507f1f77bcf86cd799439012",
      "name": { "firstName": "Juan", "firstSurname": "Pérez" },
      "email": "juan.perez@example.com",
      "phone": "+573001234567",
      "documentType": "cc",
      "documentNumber": "1234567890",
      "status": "active",
      "totalLoans": 5,
      "activeLoans": 1,
      "createdAt": "2025-01-15T10:30:00.000Z",
      "updatedAt": "2025-03-16T14:20:00.000Z"
    }
  }
}
```

**Error Responses:**

| Status | Condition                                                  |
| ------ | ---------------------------------------------------------- |
| `404`  | Customer not found or does not belong to this organization |

---

#### POST /customers

Creates a new customer.

| Parameter                   | Location | Type   | Required | Description                                                                                                               |
| --------------------------- | -------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| name.firstName              | body     | string | Yes      | First name                                                                                                                |
| name.firstSurname           | body     | string | Yes      | Surname                                                                                                                   |
| email                       | body     | string | Yes      | Email address                                                                                                             |
| phone                       | body     | string | Yes      | Phone in E.164 format                                                                                                     |
| documentType                | body     | string | Yes      | `cc`, `ce`, `passport`, `nit`, `other`                                                                                    |
| documentNumber              | body     | string | Yes      | Document number                                                                                                           |
| address                     | body     | object | No       | Colombian address object (see fields below). The entire object is optional but all sub-fields are required when provided. |
| address.streetType          | body     | string | Yes\*    | One of: Calle, Carrera, Avenida, Avenida Calle, Avenida Carrera, Diagonal, Transversal, Circular, Via                     |
| address.primaryNumber       | body     | string | Yes\*    | Primary street/road number (max 20 chars)                                                                                 |
| address.secondaryNumber     | body     | string | Yes\*    | Cross street number (max 20 chars)                                                                                        |
| address.complementaryNumber | body     | string | Yes\*    | Complement identifier, e.g. apartment/office (max 20 chars)                                                               |
| address.department          | body     | string | Yes\*    | Colombian department (max 100 chars)                                                                                      |
| address.city                | body     | string | Yes\*    | City name (max 100 chars)                                                                                                 |
| address.additionalDetails   | body     | string | No       | Additional free-text details (max 300 chars)                                                                              |
| address.postalCode          | body     | string | No       | Postal code (max 20 chars)                                                                                                |
| notes                       | body     | string | No       | Additional information                                                                                                    |

**Permission Required:** `customers:create`

**Example Request:**

```bash
curl -X POST https://api.test.local/api/v1/customers \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "name": { "firstName": "Juan", "firstSurname": "Pérez" },
    "email": "juan.perez@example.com",
    "phone": "+573001234567",
    "documentType": "cc",
    "documentNumber": "1234567890"
  }'
```

**Response:** `201 Created`

```json
{
  "status": "success",
  "data": {
    "customer": {
      "_id": "507f1f77bcf86cd799439011",
      "organizationId": "507f1f77bcf86cd799439012",
      "name": { "firstName": "Juan", "firstSurname": "Pérez" },
      "email": "juan.perez@example.com",
      "phone": "+573001234567",
      "documentType": "cc",
      "documentNumber": "1234567890",
      "status": "active",
      "totalLoans": 0,
      "activeLoans": 0,
      "createdAt": "2025-07-01T10:00:00.000Z",
      "updatedAt": "2025-07-01T10:00:00.000Z"
    }
  }
}
```

**Error Responses:**

| Status | Condition                                                                         |
| ------ | --------------------------------------------------------------------------------- |
| `400`  | Missing required fields (`name.firstName`, `name.firstSurname`, `email`, `phone`) |
| `400`  | Formato de telefono invalido (must be E.164: `+573001234567`)                     |
| `409`  | Email already in use by another customer **in the same organization**             |
| `409`  | Phone already in use by another customer **in the same organization**             |

**Notes:**

- Email and phone uniqueness are enforced **per organization**, not globally. Two different organizations may have the same customer email or phone.
- The `documentType` and `documentNumber` fields are optional but recommended for legal compliance.
- Customer is created with `status: "active"` by default.

---

#### PATCH /customers/:id

Updates a customer's information. Only provided fields are changed.

| Parameter | Location | Type   | Required | Description                    |
| --------- | -------- | ------ | -------- | ------------------------------ |
| id        | path     | string | Yes      | Customer ID                    |
| name      | body     | object | No       | Name object (partial accepted) |
| email     | body     | string | No       | Email address                  |
| phone     | body     | string | No       | Phone in E.164 format          |
| notes     | body     | string | No       | Free-text notes                |

**Permission Required:** `customers:update`

**Response:** `200 OK` — returns the updated customer object.

**Error Responses:**

| Status | Condition                                                              |
| ------ | ---------------------------------------------------------------------- |
| `404`  | Customer not found in this organization                                |
| `409`  | Email or phone already in use by another customer in this organization |

---

#### POST /customers/:id/activate

Activates or reactivates a customer (changes status to `active`).

**Authentication Required:** Yes

**Permission Required:** `customers:update`

**Example Request:**

```bash
curl -X POST https://api.test.local/api/v1/customers/507f1f77bcf86cd799439011/activate \
  -b cookies.txt
```

**Response:** `200 OK`

```json
{
  "status": "success",
  "message": "Customer activated successfully",
  "data": {
    "customer": {
      "_id": "507f1f77bcf86cd799439011",
      "organizationId": "507f1f77bcf86cd799439012",
      "name": {
        "firstName": "Juan",
        "firstSurname": "Pérez"
      },
      "email": "juan.perez@example.com",
      "phone": "+573001234567",
      "status": "active",
      "totalLoans": 5,
      "activeLoans": 1,
      "createdAt": "2026-01-15T10:30:00.000Z",
      "updatedAt": "2026-03-16T14:20:00.000Z"
    }
  }
}
```

**Notes:**

- Can reactivate customers with status `inactive` or `blacklisted`
- Customer will regain access to all services

---

#### POST /customers/:id/deactivate

Deactivates a customer (changes status to `inactive`).

**Authentication Required:** Yes

**Permission Required:** `customers:update`

**Example Request:**

```bash
curl -X POST https://api.test.local/api/v1/customers/507f1f77bcf86cd799439011/deactivate \
  -b cookies.txt
```

**Response:** `200 OK`

```json
{
  "status": "success",
  "message": "Customer deactivated successfully",
  "data": {
    "customer": {
      "_id": "507f1f77bcf86cd799439011",
      "status": "inactive"
    }
  }
}
```

**Notes:**

- This is a soft deactivation; customer data is preserved
- Can be used to temporarily disable a customer without blacklisting

---

#### POST /customers/:id/blacklist

Blacklists a customer (changes status to `blacklisted`).

**Authentication Required:** Yes

**Permission Required:** `customers:update`

**Example Request:**

```bash
curl -X POST https://api.test.local/api/v1/customers/507f1f77bcf86cd799439011/blacklist \
  -b cookies.txt
```

**Response:** `200 OK`

```json
{
  "status": "success",
  "message": "Customer blacklisted successfully",
  "data": {
    "customer": {
      "_id": "507f1f77bcf86cd799439011",
      "status": "blacklisted"
    }
  }
}
```

**Notes:**

- Should be used for customers who violated terms or have payment issues
- Blacklisted customers cannot create new loans or transactions
- Can be reactivated using the activate endpoint if needed

---

#### DELETE /customers/:id

Soft deletes a customer (sets status to inactive). Validates that customer has no active loans.

**Authentication Required:** Yes

**Permission Required:** `customers:delete`

**Example Request:**

```bash
curl -X DELETE https://api.test.local/api/v1/customers/507f1f77bcf86cd799439011 \
  -b cookies.txt
```

**Response:** `200 OK`

```json
{
  "status": "success",
  "message": "Customer deleted successfully"
}
```

**Error Responses:**

| Status | Condition                                                               |
| ------ | ----------------------------------------------------------------------- |
| `400`  | Customer has active or overdue loans — must be returned/completed first |
| `404`  | Customer not found in this organization                                 |

```json
{
  "status": "error",
  "message": "Cannot delete customer with active loans"
}
```

**Notes:**

- Cannot delete customers with active or overdue loans
- This is a soft delete (status becomes `inactive`), not a permanent deletion
- Customer data is preserved and can be reactivated

---

## Location Endpoints

Manage physical locations such as warehouses, offices, and operation points within an organization.

**Location Code:** Each location has a unique alphanumeric `code` (1-10 characters, uppercase) that serves as a business identifier and can be referenced in loan and request documents. This code must be provided by the user when creating or updating a location and is unique within the organization.

### GET /locations

Retrieves a paginated list of all locations in the organization.

**Authentication Required:** Yes  
**Permission Required:** `locations:read`

#### Query Parameters

| Parameter       | Type    | Required | Default | Description                                          |
| --------------- | ------- | -------- | ------- | ---------------------------------------------------- |
| page            | integer | No       | 1       | Page number for pagination                           |
| limit           | integer | No       | 20      | Number of items per page (max: 100)                  |
| search          | string  | No       | -       | Search by location name, street, or city             |
| city            | string  | No       | -       | Filter by exact city name (case-insensitive)         |
| includeInactive | boolean | No       | false   | Whether to include soft-deleted (inactive) locations |

#### Success Response (200 OK)

```json
{
  "status": "success",
  "message": "Locations fetched successfully",
  "data": {
    "items": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "code": "BOG01",
        "name": "Bodega Principal",
        "organizationId": "507f1f77bcf86cd799439012",
        "address": {
          "streetType": "Calle",
          "primaryNumber": "10",
          "secondaryNumber": "45",
          "complementaryNumber": "20",
          "department": "Cundinamarca",
          "city": "Bogotá",
          "additionalDetails": "Piso 2"
        },
        "isActive": true,
        "createdAt": "2026-02-20T10:30:00.000Z",
        "updatedAt": "2026-02-20T10:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 15,
      "totalPages": 1
    }
  }
}
```

---

### GET /locations/:id

Retrieves a single location by its ID.

**Authentication Required:** Yes  
**Permission Required:** `locations:read`

#### Path Parameters

| Parameter | Type   | Required | Description               |
| --------- | ------ | -------- | ------------------------- |
| id        | string | Yes      | Location MongoDB ObjectId |

#### Success Response (200 OK)

```json
{
  "status": "success",
  "message": "Location fetched successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "code": "BOG01",
    "name": "Bodega Principal",
    "organizationId": "507f1f77bcf86cd799439012",
    "address": {
      "country": "CO",
      "state": "Cundinamarca",
      "city": "Bogotá",
      "street": "Calle 10",
      "propertyNumber": "45-20",
      "additionalInfo": "Piso 2"
    },
    "createdAt": "2026-02-20T10:30:00.000Z",
    "updatedAt": "2026-02-20T10:30:00.000Z"
  }
}
```

#### Error Responses

- **400 Bad Request** – Invalid location ID format
- **404 Not Found** – Location does not exist

---

### POST /locations

Creates a new location in the organization.

**Authentication Required:** Yes  
**Permission Required:** `locations:create`

#### Request Body

| Field                               | Type     | Required | Constraints        | Description                                                                                           |
| ----------------------------------- | -------- | -------- | ------------------ | ----------------------------------------------------------------------------------------------------- |
| code                                | string   | Yes      | 1-10 chars, regex  | Unique alphanumeric code (uppercase only, pattern `^[A-Z0-9]+$`). Business identifier for location.   |
| name                                | string   | Yes      | 1-100 characters   | Location name                                                                                         |
| address.streetType                  | string   | Yes      | Enum (9 values)    | One of: Calle, Carrera, Avenida, Avenida Calle, Avenida Carrera, Diagonal, Transversal, Circular, Via |
| address.primaryNumber               | string   | Yes      | 1-20 characters    | Primary street/road number                                                                            |
| address.secondaryNumber             | string   | Yes      | 1-20 characters    | Cross street number                                                                                   |
| address.complementaryNumber         | string   | Yes      | 1-20 characters    | Complement identifier, e.g. apartment/office number                                                   |
| address.department                  | string   | Yes      | 1-100 characters   | Colombian department                                                                                  |
| address.city                        | string   | Yes      | 1-100 characters   | City name                                                                                             |
| address.additionalDetails           | string   | No       | Max 300 characters | Floor, suite, or any additional free-text details                                                     |
| address.postalCode                  | string   | No       | Max 20 characters  | Postal code                                                                                           |
| materialCapacities                  | object[] | No       | Array of mappings  | Defines max quantity of specific material types in location                                           |
| materialCapacities[].materialTypeId | string   | Yes      | Valid ObjectId     | ID of the material type to set capacity for                                                           |
| materialCapacities[].maxQuantity    | number   | Yes      | Min 0              | Maximum number of items of this type allowed here                                                     |

**Note:** `currentQuantity` for each capacity entry is managed automatically by the inventory system and cannot be provided via the API.

#### Example Request

```json
{
  "code": "MDE01",
  "name": "Bodega Norte",
  "address": {
    "streetType": "Carrera",
    "primaryNumber": "50",
    "secondaryNumber": "32",
    "complementaryNumber": "10",
    "department": "Antioquia",
    "city": "Medellín",
    "additionalDetails": "Bodega 3, entrada por el costado"
  },
  "materialCapacities": [
    {
      "materialTypeId": "507f1f77bcf86cd799439014",
      "maxQuantity": 100
    }
  ]
}
```

#### Success Response (201 Created)

```json
{
  "status": "success",
  "message": "Location created successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439013",
    "code": "MDE01",
    "name": "Bodega Norte",
    "organizationId": "507f1f77bcf86cd799439012",
    "address": {
      "country": "Colombia",
      "state": "Antioquia",
      "city": "Medellín",
      "street": "Carrera 50",
      "propertyNumber": "32-10",
      "additionalInfo": "Bodega 3, entrada por el costado"
    },
    "createdAt": "2026-02-27T15:45:00.000Z",
    "updatedAt": "2026-02-27T15:45:00.000Z"
  }
}
```

#### Error Responses

- **400 Bad Request** – Validation errors (missing required fields, invalid format, invalid code format)
- **409 Conflict** – Location with the same name or code already exists in the organization

---

### PATCH /locations/:id

Updates an existing location (partial update).

**Authentication Required:** Yes  
**Permission Required:** `locations:update`

#### Path Parameters

| Parameter | Type   | Required | Description               |
| --------- | ------ | -------- | ------------------------- |
| id        | string | Yes      | Location MongoDB ObjectId |

#### Request Body

Same fields as POST, but all are optional. Only provided fields will be updated.

| Field              | Type     | Required | Constraints       | Description                                                                                                    |
| ------------------ | -------- | -------- | ----------------- | -------------------------------------------------------------------------------------------------------------- |
| code               | string   | No       | 1-10 chars, regex | Unique alphanumeric code (uppercase only). If provided and conflicts with another location, returns 409 error. |
| name               | string   | No       | 1-100 characters  | Location name                                                                                                  |
| address            | object   | No       | -                 | Address fields (all optional)                                                                                  |
| materialCapacities | object[] | No       | -                 | Array of material capacity mappings                                                                            |

#### Example Request

```json
{
  "code": "MDE02",
  "address": {
    "state": "Cundinamarca",
    "additionalInfo": "Piso 3, oficina 301"
  }
}
```

#### Success Response (200 OK)

```json
{
  "status": "success",
  "message": "Location updated successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "code": "BOG01",
    "name": "Bodega Principal",
    "organizationId": "507f1f77bcf86cd799439012",
    "address": {
      "country": "CO",
      "state": "Cundinamarca",
      "city": "Bogotá",
      "street": "Calle 10",
      "propertyNumber": "45-20",
      "additionalInfo": "Piso 3, oficina 301"
    },
    "createdAt": "2026-02-20T10:30:00.000Z",
    "updatedAt": "2026-02-27T16:00:00.000Z"
  }
}
```

#### Error Responses

- **400 Bad Request** – Invalid location ID, validation errors, or invalid code format
- **404 Not Found** – Location does not exist
- **409 Conflict** – Code already exists in the organization (when updating code field)

---

### DELETE /locations/:id

Deactivates a location (soft delete) from the organization.

**Authentication Required:** Yes  
**Permission Required:** `locations:delete`

#### Path Parameters

| Parameter | Type   | Required | Description               |
| --------- | ------ | -------- | ------------------------- |
| id        | string | Yes      | Location MongoDB ObjectId |

#### Success Response (200 OK)

```json
{
  "status": "success",
  "message": "Location deactivated successfully",
  "data": null
}
```

#### Error Responses

- **400 Bad Request** – Invalid location ID format
- **404 Not Found** – Location does not exist
- **409 Conflict** – Location is currently assigned to material instances and cannot be deactivated

---

### POST /locations/:id/restore

Reactivates a soft-deleted location.

**Authentication Required:** Yes  
**Permission Required:** `locations:delete`

#### Path Parameters

| Parameter | Type   | Required | Description               |
| --------- | ------ | -------- | ------------------------- |
| id        | string | Yes      | Location MongoDB ObjectId |

#### Success Response (200 OK)

```json
{
  "status": "success",
  "message": "Location restored successfully",
  "data": {
    "status": "success",
    "message": "Location restored successfully",
    "data": { ... }
  }
}
```

---

### Location Permissions by Role

| Role               | locations:read | locations:create | locations:update | locations:delete |
| ------------------ | -------------- | ---------------- | ---------------- | ---------------- |
| super_admin        | Yes            | Yes              | Yes              | Yes              |
| owner              | Yes            | Yes              | Yes              | Yes              |
| manager            | Yes            | Yes              | Yes              | Yes              |
| warehouse_operator | Yes            | No               | No               | No               |
| commercial_advisor | Yes            | No               | No               | No               |

---

### Material Endpoints

#### GET /materials/categories

Lists all material categories for the organization.

**Permission Required:** `materials:read`

**Example Request:**

```bash
curl -X GET https://api.test.local/api/v1/materials/categories \
  -b cookies.txt
```

**Success Response (200):**

```json
{
  "status": "success",
  "data": {
    "categories": [
      {
        "_id": "64f1a2b3c4d5e6f7a8b9c0c9",
        "organizationId": "64f1a2b3c4d5e6f7a8b9c0d0",
        "name": "Cameras",
        "description": "Professional and consumer cameras",
        "attributes": [
          {
            "attributeId": "64f1a2b3c4d5e6f7a8b9c0d1",
            "isRequired": true
          },
          {
            "attributeId": "64f1a2b3c4d5e6f7a8b9c0d2",
            "isRequired": false
          }
        ],
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

---

#### POST /materials/categories

Creates a new category. Categories define which attributes are available to material types within them.

**Permission Required:** `materials:create`

| Parameter   | Location | Type     | Required | Description                                                                                               |
| ----------- | -------- | -------- | -------- | --------------------------------------------------------------------------------------------------------- |
| name        | body     | string   | Yes      | Category name (max 100 chars, must be unique per organization)                                            |
| code        | body     | string   | Yes      | Short code (1-10 alphanumeric chars, uppercase, unique per org). Used in `{CATEGORY_CODE}` pattern token. |
| description | body     | string   | Yes      | Category description (max 500 chars)                                                                      |
| attributes  | body     | object[] | No       | Array of attributes that belong to this category (default: `[]`)                                          |

**Attributes Array Structure:**

```typescript
attributes: [
  {
    attributeId: string, // MongoDB ObjectId of the material attribute
    isRequired: boolean, // Default required status for material types in this category (default: false)
  },
];
```

**Example Request:**

```json
{
  "name": "Cameras",
  "code": "CAM",
  "description": "Professional and consumer cameras",
  "attributes": [
    {
      "attributeId": "64f1a2b3c4d5e6f7a8b9c0d1",
      "isRequired": true
    }
  ]
}
```

**Success Response (201):**

```json
{
  "status": "success",
  "data": {
    "category": {
      "_id": "64f1a2b3c4d5e6f7a8b9c0c9",
      "organizationId": "64f1a2b3c4d5e6f7a8b9c0d0",
      "name": "Cameras",
      "code": "CAM",
      "description": "Professional and consumer cameras",
      "attributes": [
        {
          "attributeId": "64f1a2b3c4d5e6f7a8b9c0d1",
          "isRequired": true
        }
      ],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

**Validation Errors:**

- **400 Bad Request** – Category name already exists in this organization
- **400 Bad Request** – Attribute ID is invalid or does not exist in organization
- **409 Conflict** – Category code already exists in this organization

---

#### PATCH /materials/categories/:id

Updates a category. All fields are optional except that the `name` must remain unique per organization.

**Permission Required:** `materials:update`

| Parameter   | Location | Type     | Required | Description                                           |
| ----------- | -------- | -------- | -------- | ----------------------------------------------------- |
| id          | path     | string   | Yes      | Category MongoDB ObjectId                             |
| name        | body     | string   | No       | Updated category name (max 100 chars, must be unique) |
| description | body     | string   | No       | Updated description (max 500 chars)                   |
| attributes  | body     | object[] | No       | Updated array of attributes for this category         |

**Example Request:**

```json
{
  "name": "Professional Cameras",
  "attributes": [
    {
      "attributeId": "64f1a2b3c4d5e6f7a8b9c0d1",
      "isRequired": true
    },
    {
      "attributeId": "64f1a2b3c4d5e6f7a8b9c0d2",
      "isRequired": false
    }
  ]
}
```

**Success Response (200):**

```json
{
  "status": "success",
  "data": {
    "category": {
      "_id": "64f1a2b3c4d5e6f7a8b9c0c9",
      "organizationId": "64f1a2b3c4d5e6f7a8b9c0d0",
      "name": "Professional Cameras",
      "description": "Professional and consumer cameras",
      "attributes": [
        {
          "attributeId": "64f1a2b3c4d5e6f7a8b9c0d1",
          "isRequired": true
        },
        {
          "attributeId": "64f1a2b3c4d5e6f7a8b9c0d2",
          "isRequired": false
        }
      ],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

**Validation Errors:**

- **404 Not Found** – Category does not exist in this organization
- **400 Bad Request** – Updated name already exists in organization
- **400 Bad Request** – Attribute ID is invalid or does not exist

---

#### DELETE /materials/categories/:id

Deletes a material category. Fails if any material types reference this category.

**Permission Required:** `materials:delete`

**Example Request:**

```bash
curl -X DELETE https://api.test.local/api/v1/materials/categories/64f1a2b3c4d5e6f7a8b9c0c9 \
  -b cookies.txt
```

**Success Response (200):**

```json
{
  "status": "success",
  "message": "Category deleted successfully"
}
```

**Error Responses:**

| Status | Condition                                   | Message                                             |
| ------ | ------------------------------------------- | --------------------------------------------------- |
| 404    | Category not found or doesn't belong to org | `Category not found`                                |
| 400    | Category has linked material types          | `Cannot delete category while material types exist` |

---

### Material Attributes Endpoints

Material attributes are global organization-scoped attribute definitions that can be reused across multiple categories and material types. Categories define which attributes are relevant, and material types can then use those attributes.

#### GET /materials/attributes

Lists all material attributes for the organization. Optionally filtered by category.

**Permission Required:** `material_attributes:read`

| Parameter  | Location | Type   | Required | Description                                                                            |
| ---------- | -------- | ------ | -------- | -------------------------------------------------------------------------------------- |
| categoryId | query    | string | No       | If provided, retrieves only attributes that belong to this category (MongoDB ObjectId) |

**Example Request:**

```bash
curl -X GET "https://api.test.local/api/v1/materials/attributes?categoryId=64f1a2b3c4d5e6f7a8b9c0c9" \
  -b cookies.txt
```

**Success Response (200):**

```json
{
  "status": "success",
  "data": {
    "attributes": [
      {
        "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
        "organizationId": "64f1a2b3c4d5e6f7a8b9c0d0",
        "name": "Megapixels",
        "unit": "MP",
        "allowedValues": ["16", "24", "32", "45"],
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      },
      {
        "_id": "64f1a2b3c4d5e6f7a8b9c0d2",
        "organizationId": "64f1a2b3c4d5e6f7a8b9c0d0",
        "name": "Color",
        "unit": "",
        "allowedValues": ["Red", "Black", "Silver"],
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

---

#### GET /materials/attributes/:id

Gets a specific material attribute.

**Permission Required:** `material_attributes:read`

| Parameter | Location | Type   | Required | Description                |
| --------- | -------- | ------ | -------- | -------------------------- |
| id        | path     | string | Yes      | Attribute MongoDB ObjectId |

**Example Request:**

```bash
curl -X GET https://api.test.local/api/v1/materials/attributes/64f1a2b3c4d5e6f7a8b9c0d1 \
  -b cookies.txt
```

**Success Response (200):**

```json
{
  "status": "success",
  "data": {
    "attribute": {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "organizationId": "64f1a2b3c4d5e6f7a8b9c0d0",
      "name": "Megapixels",
      "unit": "MP",
      "allowedValues": ["16", "24", "32", "45"],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

---

#### POST /materials/attributes

Creates a new material attribute for the organization.

**Permission Required:** `material_attributes:create`

| Parameter     | Location | Type     | Required | Description                                                                                     |
| ------------- | -------- | -------- | -------- | ----------------------------------------------------------------------------------------------- |
| name          | body     | string   | Yes      | Attribute name (max 100 chars, must be unique per organization)                                 |
| unit          | body     | string   | No       | Unit of measurement (e.g., "MP", "mm", "kg"). Max 50 chars. (default: empty string)             |
| allowedValues | body     | string[] | No       | If provided, the value assigned to this attribute must be one of these strings. (default: `[]`) |

**Notes:**

- If `allowedValues` is empty or omitted, any value is accepted (free-form).
- If `allowedValues` is provided, values must be strings of 1–200 characters.
- Attribute names must be unique within the organization.

**Example Request (Enumerated Attribute):**

```json
{
  "name": "Megapixels",
  "unit": "MP",
  "allowedValues": ["16", "24", "32", "45"]
}
```

**Example Request (Free-form Attribute):**

```json
{
  "name": "Serial Number",
  "unit": "",
  "allowedValues": []
}
```

**Success Response (201):**

```json
{
  "status": "success",
  "data": {
    "attribute": {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "organizationId": "64f1a2b3c4d5e6f7a8b9c0d0",
      "name": "Megapixels",
      "unit": "MP",
      "allowedValues": ["16", "24", "32", "45"],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

**Validation Errors:**

- **400 Bad Request** – Attribute name already exists in this organization
- **400 Bad Request** – Invalid allowedValues (empty strings, exceeds length limits, etc.)

---

#### PATCH /materials/attributes/:id

Updates a material attribute. All fields are optional. The name, unit, and allowedValues can be individually updated.

**Permission Required:** `material_attributes:update`

| Parameter     | Location | Type     | Required | Description                                            |
| ------------- | -------- | -------- | -------- | ------------------------------------------------------ |
| id            | path     | string   | Yes      | Attribute MongoDB ObjectId                             |
| name          | body     | string   | No       | Updated attribute name (max 100 chars, must be unique) |
| unit          | body     | string   | No       | Updated unit (max 50 chars)                            |
| allowedValues | body     | string[] | No       | Updated list of allowed values                         |

**Example Request:**

```json
{
  "allowedValues": ["16", "24", "32", "45", "61"]
}
```

**Success Response (200):**

```json
{
  "status": "success",
  "data": {
    "attribute": {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "organizationId": "64f1a2b3c4d5e6f7a8b9c0d0",
      "name": "Megapixels",
      "unit": "MP",
      "allowedValues": ["16", "24", "32", "45", "61"],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-12T10:30:00.000Z"
    }
  }
}
```

**Validation Errors:**

- **404 Not Found** – Attribute does not exist or does not belong to this organization
- **400 Bad Request** – Updated name already exists in organization
- **400 Bad Request** – Invalid allowedValues format

---

#### DELETE /materials/attributes/:id

Deletes a material attribute. Fails if any material type currently references this attribute.

**Permission Required:** `material_attributes:delete`

**Example Request:**

```bash
curl -X DELETE https://api.test.local/api/v1/materials/attributes/64f1a2b3c4d5e6f7a8b9c0d1 \
  -b cookies.txt
```

**Success Response (200):**

```json
{
  "status": "success",
  "message": "Material attribute deleted successfully"
}
```

**Error Responses:**

| Status | Condition                                    | Message                                  |
| ------ | -------------------------------------------- | ---------------------------------------- |
| 404    | Attribute not found or doesn't belong to org | `Attribute not found`                    |
| 400    | Attribute is used by material types          | `Cannot delete attribute (still in use)` |

---

#### GET /materials/audit/orphaned-attribute-values

Audit endpoint: returns all material types with orphaned attribute values (i.e., values that are no longer in the attribute's `allowedValues` list). This can happen when an attribute's allowed values are reduced after material types have already been created with those values.

**Permission Required:** `materials:read`

**Example Request:**

```bash
curl -X GET https://api.test.local/api/v1/materials/audit/orphaned-attribute-values \
  -b cookies.txt
```

**Success Response (200):**

```json
{
  "status": "success",
  "data": {
    "orphanedCount": 2,
    "orphanedMaterials": [
      {
        "materialTypeId": "64f1a2b3c4d5e6f7a8b9c0de",
        "materialTypeName": "Canon EOS R5",
        "attributeName": "Megapixels",
        "currentValue": "61",
        "allowedValues": ["16", "24", "32", "45"],
        "message": "Value '61' is no longer in the allowed list"
      },
      {
        "materialTypeId": "64f1a2b3c4d5e6f7a8b9c0df",
        "materialTypeName": "Nikon Z9",
        "attributeName": "Color",
        "currentValue": "Bronze",
        "allowedValues": ["Red", "Black", "Silver"],
        "message": "Value 'Bronze' is no longer in the allowed list"
      }
    ]
  }
}
```

**Notes:**

- This endpoint is useful for detecting configuration issues after attribute constraints are tightened.
- Orphaned values can be corrected by updating the affected material type's attribute to use an allowed value, or by relaxing the attribute's `allowedValues` list.

---

#### GET /materials/types

Lists all material types (catalog items) for the organization.

**Permission Required:** `materials:read`

| Parameter  | Location | Type    | Required | Description                                               |
| ---------- | -------- | ------- | -------- | --------------------------------------------------------- |
| page       | query    | integer | No       | Page number (default: 1)                                  |
| limit      | query    | integer | No       | Items per page (default: 20)                              |
| categoryId | query    | string  | No       | Filter by category ID (shows only types in that category) |
| search     | query    | string  | No       | Search by name or description                             |

**Example Request:**

```bash
curl -X GET "https://api.test.local/api/v1/materials/types?categoryId=64f1a2b3c4d5e6f7a8b9c0c9" \
  -b cookies.txt
```

**Success Response (200):**

```json
{
  "status": "success",
  "data": {
    "materialTypes": [
      {
        "_id": "64f1a2b3c4d5e6f7a8b9c0de",
        "organizationId": "64f1a2b3c4d5e6f7a8b9c0d0",
        "name": "Canon EOS R5",
        "description": "Professional mirrorless camera",
        "categoryId": {
          "_id": "64f1a2b3c4d5e6f7a8b9c0c9",
          "name": "Cameras"
        },
        "pricePerDay": 1500,
        "attributes": [
          {
            "attributeId": "64f1a2b3c4d5e6f7a8b9c0d1",
            "value": "24",
            "isRequired": true
          },
          {
            "attributeId": "64f1a2b3c4d5e6f7a8b9c0d2",
            "value": "Red",
            "isRequired": false
          }
        ],
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "total": 1,
    "organizationTotal": 5,
    "count": 1,
    "page": 1,
    "totalPages": 1
  }
}
```

---

#### GET /materials/types/:id

Gets a specific material type.

**Permission Required:** `materials:read`

| Parameter | Location | Type   | Required | Description      |
| --------- | -------- | ------ | -------- | ---------------- |
| id        | path     | string | Yes      | Material type ID |

**Example Request:**

```bash
curl -X GET https://api.test.local/api/v1/materials/types/64f1a2b3c4d5e6f7a8b9c0de \
  -b cookies.txt
```

**Success Response (200):**

```json
{
  "status": "success",
  "data": {
    "materialType": {
      "_id": "64f1a2b3c4d5e6f7a8b9c0de",
      "organizationId": "64f1a2b3c4d5e6f7a8b9c0d0",
      "name": "Canon EOS R5",
      "description": "Professional mirrorless camera",
      "categoryId": {
        "_id": "64f1a2b3c4d5e6f7a8b9c0c9",
        "name": "Cameras"
      },
      "pricePerDay": 1500,
      "attributes": [
        {
          "attributeId": "64f1a2b3c4d5e6f7a8b9c0d1",
          "value": "24",
          "isRequired": true
        },
        {
          "attributeId": "64f1a2b3c4d5e6f7a8b9c0d2",
          "value": "Red",
          "isRequired": false
        }
      ],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

---

#### POST /materials/types

Creates a new material type. Validates against organization's catalog item limit.

**Key Points:**

- Material types must belong to at least one category.
- Attributes must have been previously defined via `POST /materials/attributes` and added to the category via `POST /materials/categories`.
- Each attribute can be independently marked as required or optional for this material type. Required attributes must have non-empty values.
- When an attribute is assigned to a material type, the value must be one of the attribute's `allowedValues` (if the attribute has constraints).

**Permission Required:** `materials:create`

| Parameter                | Location | Type     | Required | Description                                                                                                                                              |
| ------------------------ | -------- | -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| name                     | body     | string   | Yes      | Material name (max 150 chars)                                                                                                                            |
| code                     | body     | string   | Yes      | Short code (1-10 alphanumeric chars, uppercase, unique per org). Used in `{TYPE_CODE}` pattern token.                                                    |
| description              | body     | string   | Yes      | Description (max 500 chars)                                                                                                                              |
| categoryId               | body     | string[] | Yes      | Array of category IDs (MongoDB ObjectIds). A material type can belong to multiple categories. Attribute availability is inherited from these categories. |
| pricePerDay              | body     | number   | Yes      | Rental price per day (must be > 0)                                                                                                                       |
| attributes               | body     | object[] | No       | Array of attributes for this material type (only attributes from the category can be used)                                                               |
| attributes[].attributeId | body     | string   | Yes\*    | Attribute ID (MongoDB ObjectId). Attribute must exist in the organization and the selected category.                                                     |
| attributes[].value       | body     | string   | Yes\*    | Attribute value (max 500 chars, min 1 char). Must match `allowedValues` if defined on the attribute.                                                     |
| attributes[].isRequired  | body     | boolean  | No       | Whether this attribute is required for this material type (default: false)                                                                               |

**Example Request:**

```json
{
  "name": "Canon EOS R5",
  "code": "CEOSR5",
  "categoryId": ["64f1a2b3c4d5e6f7a8b9c0c9"],
  "description": "Professional mirrorless camera",
  "pricePerDay": 1500,
  "attributes": [
    {
      "attributeId": "64f1a2b3c4d5e6f7a8b9c0d1",
      "value": "24",
      "isRequired": true
    },
    {
      "attributeId": "64f1a2b3c4d5e6f7a8b9c0d2",
      "value": "Red",
      "isRequired": false
    }
  ]
}
```

**Success Response (201):**

```json
{
  "status": "success",
  "data": {
    "materialType": {
      "_id": "64f1a2b3c4d5e6f7a8b9c0de",
      "organizationId": "64f1a2b3c4d5e6f7a8b9c0d0",
      "name": "Canon EOS R5",
      "code": "CEOSR5",
      "categoryId": "64f1a2b3c4d5e6f7a8b9c0c9",
      "description": "Professional mirrorless camera",
      "pricePerDay": 1500,
      "attributes": [
        {
          "attributeId": "64f1a2b3c4d5e6f7a8b9c0d1",
          "value": "24",
          "isRequired": true
        },
        {
          "attributeId": "64f1a2b3c4d5e6f7a8b9c0d2",
          "value": "Red",
          "isRequired": false
        }
      ],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

**Validation Errors:**

| Status | Condition                                         | Message/Code                                            |
| ------ | ------------------------------------------------- | ------------------------------------------------------- |
| 400    | Required attributes have empty values             | `Attribute value cannot be empty`                       |
| 400    | Attribute value not in `allowedValues`            | `Value '...' is not allowed for attribute '...'`        |
| 400    | Attribute does not exist in organization          | `Attribute '...' not found in this organization`        |
| 400    | Attribute not available for the selected category | `Attribute '...' is not available for these categories` |
| 400    | No valid categories found                         | `No valid categories found for this material type`      |
| 409    | Organization has reached catalog item limit       | `Catalog item limit reached`                            |

---

#### PATCH /materials/types/:id

Updates a material type. All fields are optional. When updating attributes, the entire attributes array replaces the previous one.

**Permission Required:** `materials:update`

| Parameter                | Location | Type     | Required | Description                                                                                                |
| ------------------------ | -------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| id                       | path     | string   | Yes      | Material type ID (MongoDB ObjectId)                                                                        |
| name                     | body     | string   | No       | Updated material name (max 150 chars)                                                                      |
| description              | body     | string   | No       | Updated description (max 500 chars)                                                                        |
| categoryId               | body     | string[] | No       | Updated array of category IDs. When changed, attribute constraints are checked against the new categories. |
| pricePerDay              | body     | number   | No       | Updated rental price per day (must be > 0)                                                                 |
| attributes               | body     | object[] | No       | Updated array of attributes (replaces previous array completely)                                           |
| attributes[].attributeId | body     | string   | Yes\*    | Attribute ID (MongoDB ObjectId)                                                                            |
| attributes[].value       | body     | string   | Yes\*    | Attribute value (max 500 chars, min 1 char)                                                                |
| attributes[].isRequired  | body     | boolean  | No       | Whether this attribute is required for this material type (default: false)                                 |

**Example Request (Update attributes to mark one as required, add new attribute):**

```json
{
  "attributes": [
    {
      "attributeId": "64f1a2b3c4d5e6f7a8b9c0d1",
      "value": "24",
      "isRequired": true
    },
    {
      "attributeId": "64f1a2b3c4d5e6f7a8b9c0d2",
      "value": "Red",
      "isRequired": true
    },
    {
      "attributeId": "64f1a2b3c4d5e6f7a8b9c0d3",
      "value": "8K",
      "isRequired": false
    }
  ]
}
```

**Success Response (200):**

```json
{
  "status": "success",
  "data": {
    "materialType": {
      "_id": "64f1a2b3c4d5e6f7a8b9c0de",
      "organizationId": "64f1a2b3c4d5e6f7a8b9c0d0",
      "name": "Canon EOS R5",
      "categoryId": "64f1a2b3c4d5e6f7a8b9c0c9",
      "description": "Professional mirrorless camera",
      "pricePerDay": 1500,
      "attributes": [
        {
          "attributeId": "64f1a2b3c4d5e6f7a8b9c0d1",
          "value": "24",
          "isRequired": true
        },
        {
          "attributeId": "64f1a2b3c4d5e6f7a8b9c0d2",
          "value": "Red",
          "isRequired": true
        },
        {
          "attributeId": "64f1a2b3c4d5e6f7a8b9c0d3",
          "value": "8K",
          "isRequired": false
        }
      ],
      "updatedAt": "2024-01-02T12:00:00.000Z"
    }
  }
}
```

**Validation Errors:**

- **404 Not Found** – Material type not found or does not belong to the organization
- **400 Bad Request** – Category does not exist or has no valid attributes
- **400 Bad Request** – Attribute does not exist in organization or not available for the category
- **400 Bad Request** – Attribute value violates `allowedValues` restriction

---

#### DELETE /materials/types/:id

Deletes a material type. Fails if any material instances of this type exist.

**Permission Required:** `materials:delete`

| Parameter | Location | Type   | Required | Description      |
| --------- | -------- | ------ | -------- | ---------------- |
| id        | path     | string | Yes      | Material type ID |

**Example Request:**

```bash
curl -X DELETE https://api.test.local/api/v1/materials/types/64f1a2b3c4d5e6f7a8b9c0de \
  -b cookies.txt
```

**Success Response (200):**

```json
{
  "status": "success",
  "message": "Material type deleted successfully"
}
```

**Error Responses:**

| Status | Condition                            | Message                                               |
| ------ | ------------------------------------ | ----------------------------------------------------- |
| 404    | Material type not found              | `Material type not found`                             |
| 400    | Material type has existing instances | `Cannot delete material type with existing instances` |

---

#### GET /materials/catalog/overview

Returns a comprehensive, aggregation-driven operational view of the catalog and item status. All metrics and alerts are computed in a single MongoDB aggregation pipeline — no instances are loaded into application memory.

**Authentication:** Required  
**Permission:** `materials:read`

**Query Parameters:**

| Parameter        | Type   | Required | Description                                              |
| ---------------- | ------ | -------- | -------------------------------------------------------- |
| `locationId`     | string | No       | Limit scope to a specific location (org-wide if omitted) |
| `categoryId`     | string | No       | Filter material types by category                        |
| `materialTypeId` | string | No       | Filter to a single material type                         |
| `search`         | string | No       | Case-insensitive text search on material type name       |
| `page`           | number | No       | Page number (default: 1)                                 |
| `limit`          | number | No       | Items per page (default: 50)                             |

**Example Request:**

```http
GET /api/v1/materials/catalog/overview
GET /api/v1/materials/catalog/overview?locationId=<id>
GET /api/v1/materials/catalog/overview?categoryId=<id>&search=tent&page=1&limit=20
```

**Success Response (200):**

```json
{
  "status": "success",
  "data": {
    "summary": {
      "totalMaterialTypes": 12,
      "totalInstances": 340,
      "globalAvailabilityRate": 0.6471,
      "globalUtilizationRate": 0.2353,
      "materialTypesWithLowStock": 2,
      "materialTypesWithHighDamage": 1
    },
    "materialTypes": [
      {
        "materialTypeId": "64f1a2b3c4d5e6f7a8b9c0d1",
        "name": "Camping Tent 4-person",
        "pricePerDay": 25000,
        "categories": [
          { "categoryId": "64f1a2b3c4d5e6f7a8b9c0e1", "name": "Camping" }
        ],
        "totals": {
          "totalInstances": 20,
          "available": 12,
          "reserved": 3,
          "loaned": 4,
          "inUse": 0,
          "returned": 0,
          "maintenance": 1,
          "damaged": 0,
          "lost": 0,
          "retired": 0
        },
        "metrics": {
          "availabilityRate": 0.6,
          "utilizationRate": 0.2,
          "damageRate": 0.0,
          "repairRate": 0.05,
          "reservationPressure": 0.15
        },
        "alerts": []
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 12,
      "totalPages": 1
    }
  }
}
```

**Alert Types:**

| Alert Type         | Condition                                          | Severity                          |
| ------------------ | -------------------------------------------------- | --------------------------------- |
| `LOW_STOCK`        | `available < 20%` of total **and** `available < 5` | `high` (if 0 available), `medium` |
| `HIGH_UTILIZATION` | `(loaned + inUse) / total > 0.8`                   | `high`                            |
| `HIGH_DAMAGE_RATE` | `damaged / total > 0.1`                            | `high`                            |
| `HIGH_DAMAGE_RATE` | `damaged / total > 0.05`                           | `medium`                          |
| `OVER_RESERVED`    | `reserved > available`                             | `medium`                          |

**Error Responses:**

| Status | Condition                | Message        |
| ------ | ------------------------ | -------------- |
| 401    | Not authenticated        | `Unauthorized` |
| 403    | Missing `materials:read` | `Forbidden`    |

---

#### GET /materials/instances

Lists all material instances. Supports three display modes controlled by query parameters:

- **Default**: flat paginated list.
- **`byLocation=true`**: paginated list grouped by location.
- **`byUserAccessibleLocation=true`**: all instances split into two groups based on the requesting user's assigned locations (no pagination — returns all matching instances).

**Permission Required:** `materials:read`

| Parameter                | Location | Type    | Required | Description                                                                                                                                     |
| ------------------------ | -------- | ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| page                     | query    | integer | No       | Page number (default: 1). Ignored when `byUserAccessibleLocation=true`.                                                                         |
| limit                    | query    | integer | No       | Items per page (default: 20). Ignored when `byUserAccessibleLocation=true`.                                                                     |
| status                   | query    | string  | No       | `available`, `reserved`, `loaned`, `returned`, `maintenance`, `damaged`, `lost`, `retired`                                                      |
| materialTypeId           | query    | string  | No       | Filter by material type                                                                                                                         |
| search                   | query    | string  | No       | Search by serial number                                                                                                                         |
| byLocation               | query    | boolean | No       | If `true`, groups instances on the current page by location. Default: `false`. Ignored when `byUserAccessibleLocation=true`.                    |
| byUserAccessibleLocation | query    | boolean | No       | If `true`, returns all matching instances split into `currentUserLocations` (user's assigned locations) and `otherLocations`. Default: `false`. |

**Success Response (200) - Default (Flat List):**

```json
{
  "status": "success",
  "data": {
    "instances": [
      {
        "_id": "<instanceId>",
        "serialNumber": "SN-001",
        "status": "available",
        "model": {
          "_id": "<typeId>",
          "name": "Canon EOS",
          "pricePerDay": 1000
        },
        "location": {
          "_id": "<locationId>",
          "name": "Warehouse A"
        }
      }
    ],
    "total": 5,
    "page": 1,
    "totalPages": 1
  }
}
```

**Success Response (200) - With `byLocation=true`:**

```json
{
  "status": "success",
  "data": {
    "byLocation": [
      {
        "location": { "_id": "<locationId>", "name": "Warehouse A" },
        "instances": [
          {
            "_id": "<instanceId>",
            "serialNumber": "SN-001",
            "status": "available",
            "model": {
              "_id": "<typeId>",
              "name": "Canon EOS",
              "pricePerDay": 1000
            }
          }
        ]
      }
    ],
    "total": 5,
    "page": 1,
    "totalPages": 1
  }
}
```

Pagination applies to the total number of instances. When `byLocation=true` is used, the `byLocation` array groups the instances on the current page by their assigned location.

**Success Response (200) - With `byUserAccessibleLocation=true`:**

```json
{
  "status": "success",
  "data": {
    "currentUserLocations": [
      {
        "location": { "_id": "<locationId>", "name": "Warehouse A" },
        "instances": [
          {
            "_id": "<instanceId>",
            "serialNumber": "SN-001",
            "status": "available",
            "model": {
              "_id": "<typeId>",
              "name": "Canon EOS",
              "pricePerDay": 1000
            }
          }
        ]
      }
    ],
    "otherLocations": [
      {
        "location": { "_id": "<locationId2>", "name": "Warehouse B" },
        "instances": [
          {
            "_id": "<instanceId2>",
            "serialNumber": "SN-002",
            "status": "available",
            "model": {
              "_id": "<typeId>",
              "name": "Canon EOS",
              "pricePerDay": 1000
            }
          }
        ]
      }
    ]
  }
}
```

When `byUserAccessibleLocation=true`:

- `currentUserLocations` — instances whose `locationId` matches one of the locations assigned to the authenticated user (`user.locations`), grouped by location.
- `otherLocations` — instances at all other locations in the organization, grouped by location.
- Pagination parameters are ignored; all matching instances are returned.
- The same `status`, `materialTypeId`, and `search` filters apply to both groups.

---

#### GET /materials/instances/:id

Gets a specific material instance.

**Permission Required:** `materials:read`

---

#### POST /materials/instances

Creates a new material instance.

**Permission Required:** `materials:create`

| Parameter          | Location | Type    | Required | Description                                                                                 |
| ------------------ | -------- | ------- | -------- | ------------------------------------------------------------------------------------------- |
| modelId            | body     | string  | Yes      | Material type ID                                                                            |
| locationId         | body     | string  | Yes      | Location ID                                                                                 |
| serialNumber       | body     | string  | Cond.    | Max 100 chars. Required when `useBarcodeAsSerial=false` or when switch is omitted (legacy). |
| barcode            | body     | string  | Cond.    | Max 120 chars. Required when `useBarcodeAsSerial=true`.                                     |
| useBarcodeAsSerial | body     | boolean | No       | If `true`, backend persists `serialNumber = barcode`. If omitted, legacy behavior is used.  |
| status             | body     | string  | No       | `available`, `in_use`, `maintenance`, `damaged`, `retired` (default: `available`)           |
| force              | body     | boolean | No       | If true, bypasses capacity warnings at the location.                                        |

**Capacity Management Behavior:**
If the target `locationId` has a defined capacity for the `modelId` and it is already at full capacity, the API will return a **409 Conflict** error with a warning message. To proceed, the client must resubmit the request including `"force": true` in the body.

**Validation and uniqueness rules:**

- `serialNumber` and `barcode` are trimmed by backend before persistence.
- `serialNumber` is unique per organization (`organizationId + serialNumber`).
- `barcode` is unique per organization when present (`organizationId + barcode`).
- Duplicate values return **409 Conflict** with a field-specific message.

---

#### PATCH /materials/instances/:id

Updates editable material instance data (model/location/serial/barcode/notes/attributes).

**Permission Required:** `materials:update`

| Parameter          | Location | Type    | Required | Description                                                                                             |
| ------------------ | -------- | ------- | -------- | ------------------------------------------------------------------------------------------------------- |
| modelId            | body     | string  | No       | New material type ID                                                                                    |
| locationId         | body     | string  | No       | New location ID                                                                                         |
| serialNumber       | body     | string  | Cond.    | Max 100 chars. Required when `useBarcodeAsSerial=false` and no existing serial can be reused.           |
| barcode            | body     | string  | Cond.    | Max 120 chars. Required when `useBarcodeAsSerial=true` and no existing barcode can be reused.           |
| useBarcodeAsSerial | body     | boolean | No       | If `true`, backend persists `serialNumber = barcode`. If omitted, backward-compatible behavior applies. |
| notes              | body     | string  | No       | Notes (max 500 chars)                                                                                   |
| attributes         | body     | array   | No       | Updated attributes array                                                                                |
| force              | body     | boolean | No       | If true and location changes, bypasses capacity warning                                                 |

**Common errors:**

- **400 Bad Request**: validation error or missing required conditional field.
- **404 Not Found**: instance does not exist in organization scope.
- **409 Conflict**: duplicate serial or barcode in the same organization.

---

#### PATCH /materials/instances/:id/status

Updates a material instance's status (warehouse operator action).

**Permission Required:** `materials:state:update`

| Parameter | Location | Type   | Required | Description                                                                                            |
| --------- | -------- | ------ | -------- | ------------------------------------------------------------------------------------------------------ |
| status    | body     | string | Yes      | New status: `available`, `reserved`, `loaned`, `returned`, `maintenance`, `damaged`, `lost`, `retired` |
| notes     | body     | string | No       | Status change notes (max 500 chars)                                                                    |

**Valid Status Transitions:**

| From        | To                                      |
| ----------- | --------------------------------------- |
| available   | reserved, maintenance, damaged, retired |
| reserved    | available, loaned                       |
| loaned      | returned                                |
| returned    | available, maintenance, damaged         |
| maintenance | available, retired                      |
| damaged     | maintenance, retired                    |
| lost        | retired                                 |
| retired     | _(none)_                                |

---

#### DELETE /materials/instances/:id

Deletes a material instance. Only instances with `available` or `retired` status can be deleted.

**Permission Required:** `materials:delete`

---

### Transfer Endpoints

The transfer module handles the movement of material instances between different physical locations within an organization. It consists of a two-stage process: a **Transfer Request** (model-level planning/approval, before exact units are chosen) and a **Transfer** (instance-level physical shipment).

#### POST /transfers/requests

Creates a new transfer request to move materials between locations. Items are specified at the **model level** (material type + quantity) because the exact units are not yet determined at request time.

| Parameter      | Location | Type   | Required | Description                                                  |
| -------------- | -------- | ------ | -------- | ------------------------------------------------------------ |
| fromLocationId | body     | string | Yes      | Origin location ID                                           |
| toLocationId   | body     | string | Yes      | Destination location ID                                      |
| items          | body     | array  | Yes      | List of `{ modelId: string, quantity: number }` (min 1 item) |
| notes          | body     | string | No       | Request notes                                                |
| neededBy       | body     | string | No       | ISO 8601 date — deadline by which the transfer is needed     |

**Permission Required:** `transfers:create`

**Response (201):**

```json
{
  "status": "success",
  "data": {
    "_id": "64f1a2...",
    "fromLocationId": "64f1a2...",
    "toLocationId": "64f1a2...",
    "requestedBy": "64f1a2...",
    "status": "requested",
    "items": [{ "modelId": "64f1a2...", "quantity": 2 }],
    "notes": "Request for testing",
    "createdAt": "2026-03-16T..."
  }
}
```

---

#### GET /transfers/requests

Lists all transfer requests for the organization. By default, **fulfilled** requests are excluded from the results unless `fulfilled=true` is provided.

| Parameter | Location | Type    | Required | Description                                                                |
| --------- | -------- | ------- | -------- | -------------------------------------------------------------------------- |
| status    | query    | string  | No       | Filter by `requested`, `approved`, `rejected`, `fulfilled`, or `cancelled` |
| fulfilled | query    | boolean | No       | If `true`, includes fulfilled requests. Default: `false`.                  |

**Permission Required:** `transfers:read`

---

#### GET /transfers/requests/:id

Returns the details of a single transfer request, with populated references for the requesting user and both locations.

| Parameter | Location | Type   | Required | Description               |
| --------- | -------- | ------ | -------- | ------------------------- |
| id        | path     | string | Yes      | Transfer request ObjectId |

**Permission Required:** `transfers:read`

**Response (200):**

```json
{
  "status": "success",
  "data": {
    "_id": "64f1a2...",
    "organizationId": "64e9b1...",
    "status": "approved",
    "requestedBy": {
      "_id": "64e9c3...",
      "name": "Ana López",
      "email": "ana@example.com"
    },
    "fromLocationId": { "_id": "64ea01...", "name": "Bodega Central" },
    "toLocationId": { "_id": "64ea02...", "name": "Sede Norte" },
    "items": [
      { "modelId": "64eb11...", "quantity": 3, "fulfilledQuantity": 0 }
    ],
    "notes": "Urgente para evento del viernes",
    "neededBy": "2026-04-05T00:00:00.000Z",
    "createdAt": "2026-04-02T10:00:00.000Z",
    "updatedAt": "2026-04-02T11:30:00.000Z"
  }
}
```

**Error Responses:**

- `404` — Transfer request not found or does not belong to the organization

---

#### PATCH /transfers/requests/:id

Edits the `items`, `notes`, and/or `neededBy` of a transfer request. **Only the user who created the request can edit it, and only while its status is `requested`.**

> This endpoint does **not** allow changing the `status` field. To approve/reject, use `/respond`. To cancel, use `/cancel`.

| Parameter | Location | Type   | Required | Description                                                     |
| --------- | -------- | ------ | -------- | --------------------------------------------------------------- |
| items     | body     | array  | No       | Replacement list of `{ modelId, quantity }` (min 1 if provided) |
| notes     | body     | string | No       | Updated request notes (max 500 characters)                      |
| neededBy  | body     | string | No       | Updated ISO 8601 deadline date                                  |

**Permission Required:** `transfers:update`

**Error Responses:**

- `400` — Request is not in `requested` status
- `403` — Caller is not the request creator
- `404` — Transfer request not found

---

#### PATCH /transfers/requests/:id/cancel

Cancels a transfer request. **Only users assigned to the destination location (`toLocationId`) can cancel it, and only while its status is `requested`.** Sets the status to `cancelled`.

> This is distinct from **rejection**, which is performed by a source-location-assigned user via `/respond`. Cancellation is performed by a user at the destination location.

**Permission Required:** `transfers:update`

**Location Requirement:** User must be assigned to the destination location (`toLocationId`) of the transfer request.

**Error Responses:**

- `400` — Request is not in `requested` status
- `403` — User not assigned to the destination location
- `404` — Transfer request not found

**Response (200):**

```json
{
  "status": "success",
  "data": {
    "_id": "64f1a2...",
    "status": "cancelled",
    "...": "..."
  }
}
```

---

#### PATCH /transfers/requests/:id/respond

Approves or rejects a transfer request. **Only users assigned to the source location can respond to the request.** When rejecting, a `rejectionReasonId` from the organization's rejection reason catalogue is required.

| Parameter         | Location | Type   | Required                   | Description                                       |
| ----------------- | -------- | ------ | -------------------------- | ------------------------------------------------- |
| status            | body     | string | Yes                        | New status: `approved` or `rejected`              |
| rejectionReasonId | body     | string | Yes (when status=rejected) | ID of a valid, active `TransferRejectionReason`   |
| rejectionNote     | body     | string | No                         | Free-text note explaining the rejection (max 500) |

**Permission Required:** `transfers:accept`

**Location Requirement:** User must be assigned to the source location (`fromLocationId`) of the transfer request.

**Error Responses:**

- `400` — Missing rejection reason when rejecting
- `403` — User not assigned to the source location
- `404` — Rejection reason not found or inactive; User not found

---

#### POST /transfers

Initiates a physical transfer (shipment) at the **instance level**. Marks the items as `in_use` (in transit) and locks them from other operations. Optionally links to an approved transfer request.

| Parameter      | Location | Type   | Required | Description                                                                                                                                                                                               |
| -------------- | -------- | ------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| requestId      | body     | string | No       | Related approved transfer request ID                                                                                                                                                                      |
| fromLocationId | body     | string | Yes      | Origin location ID                                                                                                                                                                                        |
| toLocationId   | body     | string | Yes      | Destination location ID                                                                                                                                                                                   |
| items          | body     | array  | Yes      | List of `{ instanceId, sentCondition?, receivedCondition?, notes? }` (min 1 item). `sentCondition` and `receivedCondition` are enum: `OK`, `DAMAGED`, `MISSING_PARTS`, `DIRTY`, `REPAIR_REQUIRED`, `LOST` |
| senderNotes    | body     | string | No       | Notes from the sender                                                                                                                                                                                     |

**Permission Required:** `transfers:send`

---

#### PATCH /transfers/:id/receive

Marks a transfer as received at the destination location. Updates the location of all items and sets their status back to `available`. Optionally records the received condition per item.

| Parameter     | Location | Type   | Required | Description                                                                                                                                                                       |
| ------------- | -------- | ------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| receiverNotes | body     | string | No       | Notes from the receiver                                                                                                                                                           |
| items         | body     | array  | No       | List of `{ instanceId, receivedCondition }` to record per-item received condition. `receivedCondition` enum: `OK`, `DAMAGED`, `MISSING_PARTS`, `DIRTY`, `REPAIR_REQUIRED`, `LOST` |

**Permission Required:** `transfers:receive`

---

#### GET /transfers

Lists all physical transfers.

**Permission Required:** `transfers:read`

---

#### GET /transfers/:id

Gets detailed information about a specific transfer, including item details.

**Permission Required:** `transfers:read`

---

### Transfer Rejection Reason Endpoints

Org-scoped catalogue of reasons for denying transfer requests. Default entries are seeded at organization registration and cannot be deleted.

#### GET /transfers/rejection-reasons

Lists rejection reasons for the organization. Active reasons only by default.

| Parameter       | Location | Type    | Required | Description                              |
| --------------- | -------- | ------- | -------- | ---------------------------------------- |
| includeInactive | query    | boolean | No       | If `true`, includes inactive reasons too |

**Permission Required:** `transfers:read`

**Response (200):**

```json
{
  "status": "success",
  "data": [
    {
      "id": "64f1a2...",
      "label": "Can't send in time",
      "isActive": true,
      "isDefault": true
    },
    {
      "id": "64f1a3...",
      "label": "Custom reason",
      "isActive": true,
      "isDefault": false
    }
  ]
}
```

---

#### POST /transfers/rejection-reasons

Creates a new rejection reason.

| Parameter | Location | Type    | Required | Description                     |
| --------- | -------- | ------- | -------- | ------------------------------- |
| label     | body     | string  | Yes      | Reason label (3–120 chars)      |
| isActive  | body     | boolean | No       | Whether active. Default: `true` |

**Permission Required:** `transfer_rejection_reasons:manage`

**Error Responses:**

- `409` — A reason with this label already exists

---

#### PATCH /transfers/rejection-reasons/:id

Updates a rejection reason's label or active status.

| Parameter | Location | Type    | Required | Description                  |
| --------- | -------- | ------- | -------- | ---------------------------- |
| label     | body     | string  | No       | New label (3–120 chars)      |
| isActive  | body     | boolean | No       | Enable or disable the reason |

**Permission Required:** `transfer_rejection_reasons:manage`

**Error Responses:**

- `404` — Rejection reason not found
- `409` — Duplicate label

---

#### DELETE /transfers/rejection-reasons/:id

Permanently deletes a rejection reason. Default (seeded) reasons are protected and cannot be deleted.

**Permission Required:** `transfer_rejection_reasons:manage`

**Error Responses:**

- `400` — Default rejection reasons cannot be deleted
- `404` — Rejection reason not found

---

### Material Attribute Endpoints

**Per-MaterialType Attribute Configuration:**

Material attributes are defined globally at the organization level via these endpoints, but **each material type independently specifies which attributes are required or optional**. This means the same attribute can be required for one material type and optional for another. The `isRequired` flag on the `MaterialAttribute` definition is deprecated; instead, use the `isRequired` field in each material type's `attributes` array (see [POST /materials/types](#post-materialstypes) for details).

#### GET /materials/attributes

Lists all attribute definitions for the organization.

**Permission Required:** `material_attributes:read`

| Parameter  | Location | Type   | Required | Description                      |
| ---------- | -------- | ------ | -------- | -------------------------------- |
| categoryId | query    | string | No       | Filter attributes by category ID |

**Success Response (200):**

```json
{
  "status": "success",
  "data": {
    "attributes": [
      {
        "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
        "organizationId": "64f1a2b3c4d5e6f7a8b9c0d0",
        "categoryId": "64f1a2b3c4d5e6f7a8b9c0c9",
        "name": "Weight",
        "unit": "kg",
        "allowedValues": [],
        "isRequired": true,
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

---

#### GET /materials/attributes/:id

Gets a specific attribute definition.

**Permission Required:** `material_attributes:read`

**Success Response (200):**

```json
{
  "status": "success",
  "data": {
    "attribute": {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "organizationId": "64f1a2b3c4d5e6f7a8b9c0d0",
      "name": "RAM",
      "unit": "GB",
      "allowedValues": ["4", "8", "16", "32"],
      "isRequired": false,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

**Errors:**

- **404 Not Found** – Attribute not found or does not belong to the organization

---

#### POST /materials/attributes

Creates a new attribute definition for the organization.

**Permission Required:** `material_attributes:create`

| Parameter     | Location | Type     | Required | Description                                                                     |
| ------------- | -------- | -------- | -------- | ------------------------------------------------------------------------------- |
| name          | body     | string   | Yes      | Attribute name (max 100 chars, unique per organization)                         |
| unit          | body     | string   | No       | Unit of measurement (e.g., `kg`, `GB`, `cm`)                                    |
| categoryId    | body     | string   | No       | If set, restricts this attribute to material types of this category             |
| allowedValues | body     | string[] | No       | Enumerated acceptable values. Empty array means any value is accepted.          |
| isRequired    | body     | boolean  | No       | Whether material types must provide a value for this attribute (default: false) |

**Example Request:**

```json
{
  "name": "RAM",
  "unit": "GB",
  "allowedValues": ["4", "8", "16", "32"],
  "isRequired": true
}
```

**Success Response (201):**

```json
{
  "status": "success",
  "data": {
    "attribute": {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "organizationId": "64f1a2b3c4d5e6f7a8b9c0d0",
      "name": "RAM",
      "unit": "GB",
      "allowedValues": ["4", "8", "16", "32"],
      "isRequired": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

**Errors:**

- **400 Bad Request** – Missing required fields or invalid data
- **409 Conflict** – An attribute with this name already exists in the organization

---

#### PATCH /materials/attributes/:id

Updates an attribute definition. All fields are optional.

**Permission Required:** `material_attributes:update`

| Parameter     | Location | Type     | Required | Description                                                                          |
| ------------- | -------- | -------- | -------- | ------------------------------------------------------------------------------------ |
| name          | body     | string   | No       | Attribute name                                                                       |
| unit          | body     | string   | No       | Unit of measurement                                                                  |
| categoryId    | body     | string   | No       | Cannot be changed if material types from other categories already use this attribute |
| allowedValues | body     | string[] | No       | Cannot remove values currently in use by existing material types                     |
| isRequired    | body     | boolean  | No       | Required flag                                                                        |

**Errors:**

- **400 Bad Request** – Attempt to narrow `allowedValues` removes a value still in use, or `categoryId` change would exclude existing material types that reference this attribute
- **404 Not Found** – Attribute not found or does not belong to the organization
- **409 Conflict** – Name already taken by another attribute in the organization

---

#### DELETE /materials/attributes/:id

Deletes an attribute definition. Blocked if any material type currently references this attribute.

**Permission Required:** `material_attributes:delete`

**Errors:**

- **404 Not Found** – Attribute not found or does not belong to the organization
- **409 Conflict** – Attribute is still assigned to one or more material types and cannot be deleted

---

### Package Endpoints

#### GET /packages

Lists all packages in the organization.

---

#### GET /packages/:id

Gets a specific package.

---

#### POST /packages

Creates a new package (bundle of materials).

| Parameter   | Location | Type   | Required | Description                                 |
| ----------- | -------- | ------ | -------- | ------------------------------------------- |
| name        | body     | string | Yes      | Package name                                |
| description | body     | string | No       | Description                                 |
| items       | body     | array  | Yes      | Array of `{ materialTypeId, quantity }`     |
| pricePerDay | body     | number | No       | Override price (otherwise sum of materials) |

---

### Loan Request Endpoints

#### GET /requests

Lists all loan requests in the organization.

| Parameter  | Location | Type   | Required | Description                                                                                                               |
| ---------- | -------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| status     | query    | string | No       | `pending`, `approved`, `deposit_pending`, `assigned`, `ready`, `shipped`, `completed`, `cancelled`, `rejected`, `expired` |
| customerId | query    | string | No       | Filter by customer                                                                                                        |
| packageId  | query    | string | No       | Filter by package                                                                                                         |

---

#### POST /requests

Creates a new loan request (commercial advisor action).

| Parameter      | Location | Type   | Required | Description                                                                       |
| -------------- | -------- | ------ | -------- | --------------------------------------------------------------------------------- |
| customerId     | body     | string | Yes      | Customer ID                                                                       |
| items          | body     | array  | Yes      | Array of request items                                                            |
| startDate      | body     | string | Yes      | Loan start date (ISO 8601)                                                        |
| endDate        | body     | string | Yes      | Loan end date (ISO 8601). Must be after `startDate`.                              |
| depositDueDate | body     | string | Yes      | Date by which deposit must be paid (ISO 8601). Cannot be after `startDate`.       |
| depositAmount  | body     | number | Yes      | Deposit amount in the organization's currency. Use `0` if no deposit is required. |
| notes          | body     | string | No       | Additional notes                                                                  |

`items[]` contract (recommended):

| Field       | Type                    | Required | Description                                                           |
| ----------- | ----------------------- | -------- | --------------------------------------------------------------------- |
| type        | `material` \| `package` | Yes      | Defines which entity is resolved by `referenceId`                     |
| referenceId | string                  | Yes      | Material Type ID when type=`material`, Package ID when type=`package` |
| quantity    | number                  | No       | Defaults to `1`                                                       |

Legacy compatibility still supported per item:

| Field          | Type   | Description                                      |
| -------------- | ------ | ------------------------------------------------ |
| materialTypeId | string | Legacy alias for `type=material` + `referenceId` |
| packageId      | string | Legacy alias for `type=package` + `referenceId`  |

Validation and resolution behavior:

- `type=material` resolves an active material type in the organization.
- `type=package` resolves an active package in the organization.
- Invalid type returns `400 BAD_REQUEST`.
- Missing/inactive material reference returns `404 NOT_FOUND`.
- Missing/inactive package reference returns `404 NOT_FOUND`.

---

#### POST /requests/:id/approve

Approves a loan request (warehouse operator action).

**Auth:** `authenticate` + `requireActiveOrganization` + `requests:approve`

| Parameter | Location | Type   | Required | Description    |
| --------- | -------- | ------ | -------- | -------------- |
| notes     | body     | string | No       | Approval notes |

---

#### POST /requests/:id/reject

Rejects a loan request (warehouse operator action).

| Parameter | Location | Type   | Required | Description      |
| --------- | -------- | ------ | -------- | ---------------- |
| reason    | body     | string | Yes      | Rejection reason |

---

#### POST /requests/:id/assign-materials

Assigns inventory instances and prepares the request in a single operation (warehouse operator).

This endpoint performs assignment + ready transition atomically:

- Valid request state: `approved`
- Each `materialInstanceId` must be unique in the same payload
- Each instance must exist in the same organization
- Each instance must match the provided `materialTypeId`
- Availability is enforced at write-time (`status=available`) to prevent race conditions
- On conflict/error, all updates are rolled back

| Parameter   | Location | Type  | Required | Description                                       |
| ----------- | -------- | ----- | -------- | ------------------------------------------------- |
| assignments | body     | array | Yes      | Array of `{ materialTypeId, materialInstanceId }` |

**Success (200):** request returns with `status: "ready"` and assigned materials persisted.

**Common errors:**

- `400 BAD_REQUEST`: invalid payload, duplicated `materialInstanceId`, type-instance mismatch
- `404 NOT_FOUND`: request or material instance does not exist in organization
- `409 CONFLICT`: request not in `approved` status, one/more instances unavailable, or **temporal overlap** — one or more instances are already reserved for an overlapping date range in another approved/assigned/ready request

**Double-booking protection:** Before reserving instances, the server checks whether any of the requested `materialInstanceId` values are already assigned to another request whose date range overlaps the current request's `startDate`–`endDate`. If an overlap is detected, the entire operation is rolled back and a `409 CONFLICT` error is returned.

---

#### POST /requests/:id/ready

Marks a request as ready for pickup. This is a warehouse operator action that confirms materials have been physically prepared.

**Auth:** `authenticate` + `requireActiveOrganization` + `requests:ready`

| Parameter | Location | Type   | Required | Description         |
| --------- | -------- | ------ | -------- | ------------------- |
| id        | path     | string | Yes      | The loan request ID |

**Valid request state:** `assigned`

**Success (200):**

```json
{
  "status": "success",
  "data": { "request": { "...requestObject", "status": "ready" } },
  "message": "Solicitud lista para recolección"
}
```

**Common errors:**

| Code              | Condition                                                    |
| ----------------- | ------------------------------------------------------------ |
| `400 BAD_REQUEST` | No materials assigned to the request                         |
| `403 FORBIDDEN`   | User lacks `requests:ready` permission                       |
| `404 NOT_FOUND`   | Request not found in the organization                        |
| `409 CONFLICT`    | Request is not in a status that allows transition to `ready` |

---

#### POST /requests/:id/record-payment

Records that the deposit for a request has been paid manually (cash, bank transfer, etc.).

**Auth:** `authenticate` + `requireActiveOrganization` + `requests:update`

Valid request states: `approved`, `deposit_pending`, `assigned`, `ready`

- Requires `depositAmount > 0`; returns `400` if the request has no deposit.
- Returns `409 CONFLICT` if the deposit was already recorded as paid.

**Errors:**

| Code              | Condition                                     |
| ----------------- | --------------------------------------------- |
| `400 BAD_REQUEST` | `depositAmount` is `0` — no deposit to record |
| `404 NOT_FOUND`   | Request not found or not in a payable status  |
| `409 CONFLICT`    | Deposit already recorded as paid              |

---

#### POST /requests/:id/record-rental-payment

Records that the rental fee for a request has been paid manually (cash, bank transfer, etc.). This is separate from the deposit payment and is only relevant when the organization has `requireFullPaymentBeforeCheckout` enabled in its settings.

**Auth:** `authenticate` + `requireActiveOrganization` + `requests:update`

Valid request states: `approved`, `deposit_pending`, `assigned`, `ready`

- Requires `totalAmount > 0`; returns `400` if the request has no rental amount.
- Returns `409 CONFLICT` if the rental fee was already recorded as paid.

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "request": {
      "_id": "65e2f3c0e1a2b3c4d5e6f7a0",
      "rentalFeePaidAt": "2026-03-15T10:30:00.000Z",
      "status": "approved"
    }
  },
  "message": "Rental fee payment recorded successfully"
}
```

**Errors:**

| Code              | Condition                                      |
| ----------------- | ---------------------------------------------- |
| `400 BAD_REQUEST` | `totalAmount` is `0` — no rental fee to record |
| `404 NOT_FOUND`   | Request not found or not in a payable status   |
| `409 CONFLICT`    | Rental fee already recorded as paid            |

---

#### GET /requests/:id/available-materials

Returns material instances that can fulfil the request's material-type needs, classified by availability and split by the requesting user's accessible locations.

**Auth:** `authenticate` + `requireActiveOrganization` + `requests:read`

Each returned instance carries an `availability` tag:

| Tag         | Meaning                                                                              |
| ----------- | ------------------------------------------------------------------------------------ |
| `available` | Instance status is currently `available` — can be assigned immediately               |
| `upcoming`  | Instance is `reserved` or `loaned` but will be free before the request's `startDate` |

Instances that are `damaged`, `maintenance`, `retired`, `lost`, or won't be free in time are excluded.

**Response shape** (same split as `GET /materials/instances?byUserAccessibleLocation=true`):

```json
{
  "status": "success",
  "data": {
    "currentUserLocations": [
      {
        "location": { "_id": "...", "name": "Warehouse A" },
        "instances": [
          { "_id": "...", "serialNumber": "SN-001", "status": "available", "availability": "available", "model": { ... } },
          { "_id": "...", "serialNumber": "SN-002", "status": "reserved", "availability": "upcoming", "model": { ... } }
        ]
      }
    ],
    "otherLocations": [
      {
        "location": { "_id": "...", "name": "Warehouse B" },
        "instances": [ ... ]
      }
    ]
  }
}
```

**Common errors:**

- `404 NOT_FOUND`: request does not exist in the organization

---

#### POST /requests/:id/cancel

Cancels a loan request and releases any assigned materials back to available status.

**Auth:** `authenticate` + `requireActiveOrganization` + `requests:cancel`

| Parameter | Location | Type   | Required | Description         |
| --------- | -------- | ------ | -------- | ------------------- |
| id        | path     | string | Yes      | The loan request ID |

**Valid request states:** All states except `shipped`, `completed`, `cancelled`, and `rejected`

**Success (200):**

```json
{
  "status": "success",
  "data": { "request": { "...requestObject", "status": "cancelled" } },
  "message": "Solicitud cancelada exitosamente"
}
```

**Common errors:**

| Code              | Condition                                           |
| ----------------- | --------------------------------------------------- |
| `400 BAD_REQUEST` | Invalid request ID format                           |
| `403 FORBIDDEN`   | User lacks `requests:cancel` permission             |
| `404 NOT_FOUND`   | Request not found in the organization               |
| `409 CONFLICT`    | Request cannot be cancelled from its current status |

---

### Loan Endpoints

#### GET /loans

Lists all loans in the organization.

| Parameter  | Location | Type    | Required | Description                               |
| ---------- | -------- | ------- | -------- | ----------------------------------------- |
| status     | query    | string  | No       | `active`, `overdue`, `returned`, `closed` |
| customerId | query    | string  | No       | Filter by customer                        |
| overdue    | query    | boolean | No       | Filter overdue loans                      |

---

#### GET /loans/overdue

Gets all overdue loans (auto-updates overdue status).

---

#### GET /loans/:id

Gets a specific loan with full details. The response includes populated `customerId`, `requestId`, and `materialInstances`.

**Query Parameters:**

| Parameter           | Type    | Required | Description                                                                   |
| ------------------- | ------- | -------- | ----------------------------------------------------------------------------- |
| groupByMaterialType | boolean | No       | If `true`, group material instances by material type ID (see response below). |

**Fields populated in response:**

- `materialInstances`: Array of instances (default behavior). Each instance includes `materialInstanceId` (with `serialNumber`, `status`, `modelId`, `name`), `materialTypeId`, and `materialType` (with `_id` and `name`).
- `materialInstancesByType`: Object with material type IDs as keys and arrays of instances as values (only when `groupByMaterialType=true`). The `materialInstances` field is omitted in this case. Each instance includes the same populated fields as above.

**Example Response (default):**

```json
{
  "status": "success",
  "data": {
    "loan": {
      "_id": "...",
      "materialInstances": [
        {
          "materialInstanceId": { "_id": "...", "serialNumber": "SN-001", "status": "active", "modelId": "MOD-1", "name": "Projector HD" },
          "materialTypeId": "type-123",
          "materialType": { "_id": "type-123", "name": "Projectors" }
        }
      ],
      "deposit": { ... }
    }
  }
}
```

**Example Response (grouped):**

```json
{
  "status": "success",
  "data": {
    "loan": {
      "_id": "...",
      "materialInstancesByType": {
        "type-123": [
          {
            "materialInstanceId": { "_id": "...", "serialNumber": "SN-001", "status": "active", "modelId": "MOD-1", "name": "Projector HD" },
            "materialTypeId": "type-123",
            "materialType": { "_id": "type-123", "name": "Projectors" }
          },
          {
            "materialInstanceId": { "_id": "...", "serialNumber": "SN-002", "status": "active", "modelId": "MOD-1", "name": "Projector HD" },
            "materialTypeId": "type-123",
            "materialType": { "_id": "type-123", "name": "Projectors" }
          }
        ],
        "type-456": [
          {
            "materialInstanceId": { "_id": "...", "serialNumber": "SP-001", "status": "active", "modelId": "MOD-2", "name": "Speaker System" },
            "materialTypeId": "type-456",
            "materialType": { "_id": "type-456", "name": "Audio Equipment" }
          }
        ]
      },
      "deposit": { ... }
    }
  }
}
```

When the loan has a deposit (`deposit.amount > 0`), the response includes two computed fields on the `deposit` object:

| Computed Field             | Type    | Description                                                                                      |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| `deposit.refundAvailable`  | boolean | `true` when `deposit.status` is `refund_pending` or `partially_applied` (i.e., a refund is owed) |
| `deposit.refundableAmount` | number  | The remaining deposit amount after subtracting any applied damage charges                        |

These fields are also included in `GET /loans` list responses.

---

#### POST /loans/from-request/:requestId

Creates a loan from a ready request (pickup / checkout action).

**Auth:** `authenticate` + `requireActiveOrganization` + `loans:create`

**Preconditions (enforced server-side):**

1. The request must be in `ready` status.
2. If `depositAmount > 0`, the deposit must have been recorded as paid (`depositPaidAt` is set). Use `POST /requests/:id/record-payment` to record manual payments first.
3. If the organization setting `requireFullPaymentBeforeCheckout` is `true` and the request has a `totalAmount > 0`, the rental fee must have been recorded as paid (`rentalFeePaidAt` is set). Use `POST /requests/:id/record-rental-payment` first.

On success:

- A new `Loan` is created with `status: "active"`.
- The source request transitions to `status: "shipped"` and its `loanId` field is populated with the new loan's ID.
- All assigned material instances are marked as `loaned`.
- Each material instance's `conditionAtCheckout` is captured from the instance's current condition.

**Errors:**

| Code              | Condition                                                                      |
| ----------------- | ------------------------------------------------------------------------------ |
| `400 BAD_REQUEST` | Deposit has not been paid and `depositAmount > 0`                              |
| `400 BAD_REQUEST` | Rental fee has not been paid and `requireFullPaymentBeforeCheckout` is enabled |
| `404 NOT_FOUND`   | Request not found or not in `ready` status                                     |

---

### Inspection Endpoints

Manage material inspections for returned loans.

#### GET /inspections

Lists all inspections for the organization.

| Parameter | Location | Type   | Required | Description                |
| --------- | -------- | ------ | -------- | -------------------------- |
| page      | query    | number | No       | Page number (default: 1)   |
| limit     | query    | number | No       | Page size (default: 20)    |
| loanId    | query    | string | No       | Filter inspections by loan |

**Auth:** `authenticate` + `requireActiveOrganization` + `inspections:read`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "inspections": [
      {
        "_id": "65e2f3c0e1a2b3c4d5e6f7a1",
        "organizationId": "65e2f3c0e1a2b3c4d5e6f7b2",
        "loanId": {
          "_id": "65e2f3c0e1a2b3c4d5e6f7c3",
          "customerId": "65e2f3c0e1a2b3c4d5e6f7d4",
          "startDate": "2026-03-01T10:00:00.000Z",
          "endDate": "2026-03-05T10:00:00.000Z"
        },
        "inspectedBy": {
          "email": "operator@example.com",
          "profile": { "firstName": "John" }
        },
        "status": "completed",
        "createdAt": "2026-03-10T14:20:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "totalPages": 1
  }
}
```

---

#### GET /inspections/:id

Gets a specific inspection by ID with full item details.

**Auth:** `authenticate` + `requireActiveOrganization` + `inspections:read`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "inspection": {
      "_id": "65e2f3c0e1a2b3c4d5e6f7a1",
      "loanId": { ... },
      "items": [
        {
          "materialInstanceId": {
            "_id": "65e2f3c0e1a2b3c4d5e6f7e5",
            "serialNumber": "SN-001",
            "modelId": "MOD-123"
          },
          "conditionBefore": "good",
          "conditionAfter": "damaged",
          "conditionDegraded": true,
          "damageDescription": "Scratched screen",
          "chargeToCustomer": 50000,
          "repairRequired": true
        }
      ],
      "notes": "Customer reported accidental drop",
      "status": "completed"
    }
  }
}
```

---

#### POST /inspections

Creates an inspection for a returned loan. If damages or lost items are reported with a cost, a "damage" invoice is automatically generated for the customer. The inspection document itself is the authoritative damage record for the loan — no incident is auto-created.

The server automatically populates `conditionBefore` from the material instance's `conditionAtCheckout` recorded when the loan was created, and computes `conditionDegraded` (boolean) by comparing the severity index of `conditionBefore` against the submitted `condition`. If no damages are found, the loan is auto-transitioned to `inspected` status.

**Material instance status side-effects:** After the inspection is saved, each inspected material instance is automatically transitioned to a new status based on the reported condition:

| `condition` reported        | MaterialInstance status set to |
| --------------------------- | ------------------------------ |
| `excellent`, `good`, `fair` | `available`                    |
| `poor`                      | `maintenance`                  |
| `damaged`                   | `damaged`                      |
| `lost`                      | `lost`                         |

The resulting status is also stored in the `transitionedToStatus` field on each inspection item sub-document for auditability.

| Parameter                | Location | Type     | Required | Description                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | -------- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| loanId                   | body     | string   | Yes      | ID of the loan being inspected (must be in `returned` status)                                                                                                                                                                                                                                                                                                                                                     |
| overallNotes             | body     | string   | No       | General notes about the inspection                                                                                                                                                                                                                                                                                                                                                                                |
| items                    | body     | object[] | Yes      | Array of inspected items                                                                                                                                                                                                                                                                                                                                                                                          |
| items.materialInstanceId | body     | string   | Yes      | ID of the material instance                                                                                                                                                                                                                                                                                                                                                                                       |
| items.condition          | body     | string   | Yes      | `good`, `damaged`, `lost`                                                                                                                                                                                                                                                                                                                                                                                         |
| items.notes              | body     | string   | No       | Notes for this specific item                                                                                                                                                                                                                                                                                                                                                                                      |
| items.damageDescription  | body     | string   | No       | Description of the damage                                                                                                                                                                                                                                                                                                                                                                                         |
| items.damageCost         | body     | number   | No       | Cost in cents to be charged to the customer (e.g., 150000 = $1,500.00 COP)                                                                                                                                                                                                                                                                                                                                        |
| dueDate                  | body     | string   | No       | Optional ISO datetime for the damage invoice due date. Only allowed when one or more items are `damaged` or `lost` and a damage invoice will be generated. If provided it will be set as the invoice `dueDate`; otherwise the server defaults to the organization's `damageDueDays` setting (default: 30 days from creation). Supplying `dueDate` when no invoice will be generated results in `400 Bad Request`. |

**Auth:** `authenticate` + `requireActiveOrganization` + `inspections:create`

**Preconditions:**

1. The loan must exist and be in `returned` status.
2. All material instances associated with the loan must be included in the `items` array.
3. An inspection must not already exist for the loan.
4. If the optional `dueDate` is provided it must be an ISO datetime string and will only be accepted when damages/losses are present (an invoice will be created). Otherwise the server rejects the request with `400 Bad Request`.

**Response:** `201 Created`

```json
{
  "status": "success",
  "data": { "inspection": { ... } },
  "message": "Inspection created. Damage invoice generated for $500.00"
}
```

---

#### GET /inspections/pending-loans

Lists all loans that have been returned but have not yet been inspected. This endpoint is used by warehouse operators to see their pending task list.

**Auth:** `authenticate` + `requireActiveOrganization` + `inspections:create`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "pendingLoans": [
      {
        "_id": "65e2f3c0e1a2b3c4d5e6f7c3",
        "customerId": { "email": "client@example.com", "name": "Event Co" },
        "materialInstances": [
          { "_id": "65e2f3c0e1a2b3c4d5e6f7e5", "serialNumber": "SN-001" }
        ],
        "startDate": "2026-03-01T10:00:00.000Z",
        "endDate": "2026-03-05T10:00:00.000Z",
        "status": "returned"
      }
    ]
  }
}
```

---

---

#### POST /loans/:id/extend

Extends a loan's end date.

| Parameter  | Location | Type   | Required | Description             |
| ---------- | -------- | ------ | -------- | ----------------------- |
| newEndDate | body     | string | Yes      | New end date (ISO 8601) |
| notes      | body     | string | No       | Extension notes         |

---

#### POST /loans/:id/return

Marks a loan as returned and initiates the inspection process.

**Auth:** `authenticate` + `requireActiveOrganization` + `loans:return`

| Parameter | Location | Type   | Required | Description                         |
| --------- | -------- | ------ | -------- | ----------------------------------- |
| notes     | body     | string | No       | Return notes or damage observations |

**Preconditions:**

The loan must be in `active` or `overdue` status.

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": { "loan": { "...loanObject", "status": "returned" } },
  "message": "Préstamo marcado como devuelto - inspección pendiente"
}
```

**Errors:**

| Code            | Condition                                              |
| --------------- | ------------------------------------------------------ |
| `403 FORBIDDEN` | User lacks `loans:return` permission                   |
| `404 NOT_FOUND` | Loan not found or not in an active/overdue state       |
| `409 CONFLICT`  | Loan cannot transition to returned from current status |

---

#### POST /loans/:id/complete

Completes a loan after inspection (transitions to `closed` status).

**Auth:** `authenticate` + `requireActiveOrganization` + `loans:update`

**Preconditions:**

1. The loan must be in `returned` status.
2. A completed inspection must exist for the loan.
3. If the loan has a deposit (`deposit.amount > 0`), the deposit must be fully resolved — `deposit.status` must be `"applied"` or `"refunded"`. Attempting to close a loan while its deposit is in any other status (e.g. `"held"`, `"partially_applied"`, `"refund_pending"`) will result in `400 Bad Request`.

**Errors:**

| Code              | Condition                                               |
| ----------------- | ------------------------------------------------------- |
| `400 BAD_REQUEST` | Deposit is not fully resolved (`applied` or `refunded`) |
| `400 BAD_REQUEST` | No inspection exists for the loan                       |
| `404 NOT_FOUND`   | Loan not found or not in `returned` status              |

---

#### POST /loans/:id/deposit/refund

Refunds the deposit for a loan whose deposit is in `refund_pending` (no damages found) or `partially_applied` (deposit only partially covered damage charges) status.

This endpoint records a `refund` deposit transaction, sets `deposit.status` to `"refunded"`, and allows the loan to subsequently be completed.

**Auth:** `authenticate` + `requireActiveOrganization` + `loans:update`

| Parameter | Location | Type   | Required | Description                                    |
| --------- | -------- | ------ | -------- | ---------------------------------------------- |
| notes     | body     | string | No       | Notes describing the physical refund (max 500) |

**Preconditions:**

1. Loan must exist for the organization.
2. A completed inspection must exist for the loan.
3. `deposit.status` must be `"refund_pending"` or `"partially_applied"`.

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "loan": {
      "_id": "65e2f3c0e1a2b3c4d5e6f7c3",
      "deposit": {
        "amount": 50000,
        "status": "refunded",
        "transactions": [
          {
            "type": "held",
            "amount": 50000,
            "date": "2026-03-01T10:00:00.000Z",
            "reference": "Deposit held at checkout"
          },
          {
            "type": "refund",
            "amount": 50000,
            "date": "2026-03-10T14:20:00.000Z",
            "reference": "Physical refund handed to customer"
          }
        ]
      }
    }
  },
  "message": "Deposit refunded successfully"
}
```

**Errors:**

| Code              | Condition                                                        |
| ----------------- | ---------------------------------------------------------------- |
| `400 BAD_REQUEST` | Loan has no deposit (`deposit.amount === 0`)                     |
| `400 BAD_REQUEST` | No completed inspection exists for the loan                      |
| `400 BAD_REQUEST` | Deposit is not in `refund_pending` or `partially_applied` status |
| `404 NOT_FOUND`   | Loan not found                                                   |

---

### Deposit Schema Reference

Loans that were created from a request with `depositAmount > 0` carry a `deposit` sub-document with the following structure:

```json
{
  "deposit": {
    "amount": 50000,
    "status": "held",
    "transactions": [
      {
        "type": "held | applied | refund",
        "amount": 50000,
        "date": "2026-03-01T10:00:00.000Z",
        "reference": "Deposit held at checkout"
      }
    ]
  }
}
```

**Deposit status lifecycle:**

| Status              | Meaning                                                                  |
| ------------------- | ------------------------------------------------------------------------ |
| `not_required`      | No deposit collected (amount = 0)                                        |
| `held`              | Deposit collected and held — loan active or awaiting return/inspection   |
| `partially_applied` | Deposit partially covered damage charges; remainder must be refunded     |
| `applied`           | Full deposit applied to damage invoice (invoice fully or partially paid) |
| `refund_pending`    | No damages — physical refund must be issued to customer                  |
| `refunded`          | Deposit returned to customer (physical or digital)                       |

**Deposit transition rules (set automatically by POST /inspections):**

- Damages found AND `depositAmt >= invoiceTotal` → `applied`
- Damages found AND `depositAmt < invoiceTotal` → `partially_applied`
- No damages → `refund_pending`
- Manual refund via `POST /loans/:id/deposit/refund` → `refunded`

### Package Endpoints

All package routes require authentication and an active organization. Routes are protected with role-based permissions as noted.

#### GET /packages

Lists all packages in the organization.

**Permission Required:** `packages:read`

Query Parameters:

| Parameter | Location | Type    | Required | Description                                            |
| --------- | -------- | ------- | -------- | ------------------------------------------------------ |
| page      | query    | integer | No       | Page number (default: 1)                               |
| limit     | query    | integer | No       | Items per page (default: 20)                           |
| isActive  | query    | boolean | No       | Filter active packages (true/false)                    |
| search    | query    | string  | No       | Search by name or description (case-insensitive regex) |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "packages": [
      /* array of packages */
    ],
    "total": 0,
    "page": 1,
    "totalPages": 0
  }
}
```

---

#### GET /packages/:id

Gets a specific package by ID.

**Permission Required:** `packages:read`

**Response:** `200 OK` - returns `{ status: "success", data: { package: <package> } }`

---

#### POST /packages

Creates a new package (bundle of materials).

**Permission Required:** `packages:create`

Request body (validated against `PackageZodSchema` with `organizationId` omitted):

| Parameter     | Location | Type   | Required | Description                                 |
| ------------- | -------- | ------ | -------- | ------------------------------------------- |
| name          | body     | string | Yes      | Package name                                |
| description   | body     | string | No       | Description                                 |
| materialTypes | body     | array  | Yes      | Array of `{ materialTypeId, quantity }`     |
| pricePerDay   | body     | number | No       | Override price (otherwise sum of materials) |

**Response:** `201 Created` - returns `{ status: "success", data: { package: <createdPackage> } }`

---

#### PATCH /packages/:id

Updates a package (partial update).

**Permission Required:** `packages:update`

Request body: partial `PackageZodSchema` (organizationId omitted). Response: `{ status: "success", data: { package: <updatedPackage> } }`

---

#### POST /packages/:id/activate

Activates a package.

**Permission Required:** `packages:update`

**Response:** `200 OK` - `{ status: "success", data: { package: <package> }, message: "Package activated successfully" }`

---

#### POST /packages/:id/deactivate

Deactivates a package.

**Permission Required:** `packages:update`

**Response:** `200 OK` - `{ status: "success", data: { package: <package> }, message: "Package deactivated successfully" }`

---

#### DELETE /packages/:id

Deletes a package.

**Permission Required:** `packages:delete`

**Response:** `200 OK` - `{ status: "success", message: "Package deleted successfully" }`

---

#### GET /packages/:id/availability

Checks whether a package can be fulfilled for a given date range. Returns per-item availability with instance counts grouped by location.

**Permission Required:** `packages:read`

| Parameter | Location | Type   | Required | Description                                                         |
| --------- | -------- | ------ | -------- | ------------------------------------------------------------------- |
| id        | path     | string | Yes      | Package ObjectId                                                    |
| startDate | query    | string | Yes      | Start of requested loan period (ISO 8601, e.g. `2025-08-01`)        |
| endDate   | query    | string | Yes      | End of requested loan period (ISO 8601). Must be after `startDate`. |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "packageId": "665a1b2c3d4e5f6a7b8c9d0e",
    "packageName": "Basic Event Kit",
    "startDate": "2025-08-01T00:00:00.000Z",
    "endDate": "2025-08-05T00:00:00.000Z",
    "canFulfill": true,
    "items": [
      {
        "materialTypeId": "664abc123def456789012345",
        "materialTypeName": "Folding Chair",
        "requiredQuantity": 10,
        "totalAvailable": 25,
        "isSatisfied": true,
        "locations": [
          {
            "locationId": "664abc123def456789012346",
            "locationName": "Main Warehouse",
            "count": 20,
            "instances": [
              {
                "instanceId": "664abc123def456789012347",
                "serialNumber": "FC-001",
                "barcode": "1234567890",
                "status": "available"
              }
            ]
          }
        ]
      }
    ]
  }
}
```

**Notes:**

- `canFulfill` is `true` only when every item in the package has `totalAvailable >= requiredQuantity`.
- Instances that are tied to active/overdue loans or approved/assigned/ready/shipped requests overlapping the date range are excluded from availability.
- Useful for pre-checking availability before creating a loan request with `type: "package"`.

**Errors:**

- `400` — `BAD_REQUEST`: Missing or invalid date parameters, or `endDate` not after `startDate`.
- `404` — `NOT_FOUND`: Package not found in this organization.

---

### Incident Endpoints

Manage incident reports (novedades) for operational events. Incidents track damage, loss, overdue, and other notable events across different contexts: loan operations, transit, storage, maintenance, or other scenarios. Each incident requires a `context` field identifying where/why it occurred. They can be created manually or by the scheduler. Note: inspections are the authoritative damage record for loan contexts and no longer auto-create incidents.

#### GET /incidents

Lists all incidents for the organization with optional filters and pagination.

| Parameter  | Location | Type   | Required | Description                                                              |
| ---------- | -------- | ------ | -------- | ------------------------------------------------------------------------ |
| page       | query    | number | No       | Page number (default: 1)                                                 |
| limit      | query    | number | No       | Page size (default: 20)                                                  |
| loanId     | query    | string | No       | Filter by loan ID                                                        |
| locationId | query    | string | No       | Filter by location ID                                                    |
| context    | query    | string | No       | `transit`, `storage`, `loan`, `maintenance`, `other`                     |
| type       | query    | string | No       | `damage`, `lost`, `overdue`, `issue`, `replacement`, `extended`, `other` |
| status     | query    | string | No       | `open`, `acknowledged`, `resolved`, `dismissed`                          |
| severity   | query    | string | No       | `low`, `medium`, `high`, `critical`                                      |
| sourceType | query    | string | No       | `inspection`, `scheduler`, `manual`                                      |
| sortBy     | query    | string | No       | Field to sort by                                                         |
| sortOrder  | query    | string | No       | `asc` or `desc`                                                          |

**Auth:** `authenticate` + `requireActiveOrganization` + `incidents:read`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "incidents": [
      {
        "_id": "65e2f3c0e1a2b3c4d5e6f7a1",
        "organizationId": "65e2f3c0e1a2b3c4d5e6f7b2",
        "loanId": "65e2f3c0e1a2b3c4d5e6f7c3",
        "locationId": null,
        "context": "loan",
        "type": "damage",
        "status": "open",
        "severity": "medium",
        "sourceType": "inspection",
        "sourceId": "65e2f3c0e1a2b3c4d5e6f7d4",
        "relatedMaterialInstances": ["65e2f3c0e1a2b3c4d5e6f7e5"],
        "description": "Scratches found on surface during return inspection",
        "financialImpact": {
          "estimated": 50000,
          "currency": "COP"
        },
        "createdBy": "65e2f3c0e1a2b3c4d5e6f7f6",
        "createdAt": "2026-03-10T14:20:00.000Z",
        "updatedAt": "2026-03-10T14:20:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "totalPages": 1
  }
}
```

**Errors:**

- `400` — `BAD_REQUEST`: Invalid query parameters.

---

#### GET /incidents/:id

Gets a specific incident by ID.

| Parameter | Location | Type   | Required | Description |
| --------- | -------- | ------ | -------- | ----------- |
| id        | path     | string | Yes      | Incident ID |

**Auth:** `authenticate` + `requireActiveOrganization` + `incidents:read`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "incident": {
      "_id": "65e2f3c0e1a2b3c4d5e6f7a1",
      "organizationId": "65e2f3c0e1a2b3c4d5e6f7b2",
      "loanId": "65e2f3c0e1a2b3c4d5e6f7c3",
      "locationId": null,
      "context": "loan",
      "type": "damage",
      "status": "acknowledged",
      "severity": "medium",
      "sourceType": "inspection",
      "sourceId": "65e2f3c0e1a2b3c4d5e6f7d4",
      "relatedMaterialInstances": ["65e2f3c0e1a2b3c4d5e6f7e5"],
      "description": "Scratches found on surface during return inspection",
      "financialImpact": {
        "estimated": 50000,
        "currency": "COP"
      },
      "createdBy": "65e2f3c0e1a2b3c4d5e6f7f6",
      "resolvedAt": null,
      "resolvedBy": null,
      "resolution": null,
      "createdAt": "2026-03-10T14:20:00.000Z",
      "updatedAt": "2026-03-10T16:00:00.000Z"
    }
  }
}
```

**Errors:**

- `404` — `NOT_FOUND`: Incident not found in this organization.

---

#### POST /incidents

Creates a new incident manually.

**Auth:** `authenticate` + `requireActiveOrganization` + `incidents:create`

**Request Body:**

| Field                    | Type     | Required | Description                                                              |
| ------------------------ | -------- | -------- | ------------------------------------------------------------------------ |
| loanId                   | string   | No       | ID of the related loan (required when `context` is `"loan"`)             |
| locationId               | string   | No       | ID of the related location (useful for `transit`/`storage` context)      |
| context                  | string   | Yes      | `transit`, `storage`, `loan`, `maintenance`, `other`                     |
| type                     | string   | Yes      | `damage`, `lost`, `overdue`, `issue`, `replacement`, `extended`, `other` |
| severity                 | string   | No       | `low`, `medium`, `high`, `critical` (default: `medium`)                  |
| relatedMaterialInstances | string[] | No       | Array of material instance IDs                                           |
| description              | string   | No       | Description (max 2000 chars)                                             |
| financialImpact          | object   | No       | `{ estimated?: number, actual?: number, currency?: string }`             |
| metadata                 | object   | No       | Arbitrary additional data                                                |

**Example Request:**

```json
{
  "loanId": "65e2f3c0e1a2b3c4d5e6f7c3",
  "context": "loan",
  "type": "damage",
  "severity": "medium",
  "relatedMaterialInstances": ["65e2f3c0e1a2b3c4d5e6f7e5"],
  "description": "Client reported a dent on equipment casing",
  "financialImpact": {
    "estimated": 75000,
    "currency": "COP"
  }
}
```

**Note:** `loanId` is required when `context` is `"loan"`. For non-loan incidents (e.g., transit damage, warehouse storage issues), use the appropriate `context` value and optionally provide `locationId`.

**Material instance status side-effects:** Each ID in `relatedMaterialInstances` is automatically transitioned based on incident `type` when the incident is created:

| `type`                         | MaterialInstance status set to |
| ------------------------------ | ------------------------------ |
| `damage`                       | `damaged`                      |
| `lost`                         | `lost`                         |
| `issue`                        | `maintenance`                  |
| `replacement`                  | `retired`                      |
| `overdue`, `extended`, `other` | _(no automatic change)_        |

**Response:** `201 Created`

```json
{
  "status": "success",
  "data": {
    "incident": {
      "_id": "65e2f3c0e1a2b3c4d5e6f7a1",
      "organizationId": "65e2f3c0e1a2b3c4d5e6f7b2",
      "loanId": "65e2f3c0e1a2b3c4d5e6f7c3",
      "locationId": null,
      "context": "loan",
      "type": "damage",
      "status": "open",
      "severity": "medium",
      "sourceType": "manual",
      "relatedMaterialInstances": ["65e2f3c0e1a2b3c4d5e6f7e5"],
      "description": "Client reported a dent on equipment casing",
      "financialImpact": {
        "estimated": 75000,
        "currency": "COP"
      },
      "createdBy": "65e2f3c0e1a2b3c4d5e6f7f6",
      "createdAt": "2026-03-12T09:00:00.000Z",
      "updatedAt": "2026-03-12T09:00:00.000Z"
    }
  },
  "message": "Incident created successfully"
}
```

**Errors:**

- `400` — `BAD_REQUEST`: Invalid or missing fields.
- `409` — `CONFLICT`: Duplicate incident (same organizationId + sourceType + sourceId + type combination).

---

#### POST /incidents/:id/acknowledge

Acknowledges an open incident.

| Parameter | Location | Type   | Required | Description |
| --------- | -------- | ------ | -------- | ----------- |
| id        | path     | string | Yes      | Incident ID |

**Auth:** `authenticate` + `requireActiveOrganization` + `incidents:acknowledge`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "incident": {
      "_id": "65e2f3c0e1a2b3c4d5e6f7a1",
      "status": "acknowledged",
      "type": "damage",
      "severity": "medium",
      "loanId": "65e2f3c0e1a2b3c4d5e6f7c3",
      "createdAt": "2026-03-12T09:00:00.000Z",
      "updatedAt": "2026-03-12T10:30:00.000Z"
    }
  },
  "message": "Incident acknowledged"
}
```

**Errors:**

- `404` — `NOT_FOUND`: Incident not found in this organization.
- `409` — `CONFLICT`: Invalid status transition (e.g., incident is already resolved).

---

#### POST /incidents/:id/resolve

Resolves an incident with a resolution note.

| Parameter  | Location | Type   | Required | Description        |
| ---------- | -------- | ------ | -------- | ------------------ |
| id         | path     | string | Yes      | Incident ID        |
| resolution | body     | string | Yes      | Resolution details |

**Auth:** `authenticate` + `requireActiveOrganization` + `incidents:resolve`

**Material instance status side-effects:** Related material instances are automatically transitioned based on the incident `type` when resolution is saved:

| `type`                        | MaterialInstance status set to |
| ----------------------------- | ------------------------------ |
| `damage`                      | `maintenance`                  |
| `issue`                       | `available`                    |
| `lost`, `replacement`, others | _(no automatic change)_        |

**Example Request:**

```json
{
  "resolution": "Equipment repaired and returned to inventory. Customer charged COP 50,000."
}
```

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "incident": {
      "_id": "65e2f3c0e1a2b3c4d5e6f7a1",
      "status": "resolved",
      "type": "damage",
      "severity": "medium",
      "loanId": "65e2f3c0e1a2b3c4d5e6f7c3",
      "resolution": "Equipment repaired and returned to inventory. Customer charged COP 50,000.",
      "resolvedAt": "2026-03-15T11:00:00.000Z",
      "resolvedBy": "65e2f3c0e1a2b3c4d5e6f7f6",
      "createdAt": "2026-03-12T09:00:00.000Z",
      "updatedAt": "2026-03-15T11:00:00.000Z"
    }
  },
  "message": "Incident resolved"
}
```

**Errors:**

- `400` — `BAD_REQUEST`: Missing resolution text.
- `404` — `NOT_FOUND`: Incident not found in this organization.
- `409` — `CONFLICT`: Invalid status transition (e.g., incident is already resolved or dismissed).

---

#### POST /incidents/:id/dismiss

Dismisses an open or acknowledged incident. Dismissal means the incident was a false alarm — no automatic material instance status changes are applied. Any instance status corrections must be made manually.

| Parameter  | Location | Type   | Required | Description          |
| ---------- | -------- | ------ | -------- | -------------------- |
| id         | path     | string | Yes      | Incident ID          |
| resolution | body     | string | Yes      | Reason for dismissal |

**Auth:** `authenticate` + `requireActiveOrganization` + `incidents:dismiss`

**Example Request:**

```json
{
  "resolution": "False alarm — item was misidentified during inspection."
}
```

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "incident": {
      "_id": "65e2f3c0e1a2b3c4d5e6f7a1",
      "status": "dismissed",
      "type": "damage",
      "severity": "medium",
      "loanId": "65e2f3c0e1a2b3c4d5e6f7c3",
      "resolution": "False alarm — item was misidentified during inspection.",
      "resolvedAt": "2026-03-13T08:00:00.000Z",
      "resolvedBy": "65e2f3c0e1a2b3c4d5e6f7f6",
      "createdAt": "2026-03-12T09:00:00.000Z",
      "updatedAt": "2026-03-13T08:00:00.000Z"
    }
  },
  "message": "Incident dismissed"
}
```

**Errors:**

- `400` — `BAD_REQUEST`: Missing resolution text.
- `404` — `NOT_FOUND`: Incident not found in this organization.
- `409` — `CONFLICT`: Invalid status transition (e.g., incident is already resolved or dismissed).

---

### Invoice Endpoints

#### GET /invoices

Lists all invoices.

| Parameter | Location | Type    | Required | Description                    |
| --------- | -------- | ------- | -------- | ------------------------------ |
| status    | query    | string  | No       | `pending`, `paid`, `cancelled` |
| type      | query    | string  | No       | `rental`, `damage`, `deposit`  |
| overdue   | query    | boolean | No       | Filter overdue invoices        |

---

#### GET /invoices/summary

Gets invoice statistics.

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "pending": { "count": 12, "total": 4500000 },
    "paid": { "count": 156, "total": 45000000 },
    "overdueCount": 3
  }
}
```

---

#### POST /invoices

Creates a new invoice.

---

#### POST /invoices/:id/pay

Records a payment against an invoice. The endpoint validates the provided `paymentMethodId` belongs to the authenticated organization and is active. On success it returns the newly recorded payment record (not the full invoice document).

| Parameter       | Location | Type   | Required | Description                                   |
| --------------- | -------- | ------ | -------- | --------------------------------------------- |
| amount          | body     | number | Yes      | Payment amount (same units as invoice totals) |
| paymentMethodId | body     | string | Yes      | Payment method ObjectId (organization-scoped) |
| reference       | body     | string | No       | Optional payment reference or transaction id  |

**Response `200`:**

```json
{
  "status": "success",
  "data": {
    "payment": {
      "amount": 50000,
      "paymentMethodId": "664abc123def456789012346",
      "method": "Efectivo",
      "notes": "Received at front desk",
      "paidAt": "2026-03-29T12:34:56.000Z"
    }
  },
  "message": "Payment recorded. Remaining balance: $250.00"
}
```

**Notes:**

- The returned `payment` object is the newly appended payment subdocument stored on the invoice (the last element in the `payments` array).
- Clients that need the updated invoice should call `GET /invoices/:id` after recording the payment.

**Errors:**

- `400` — `BAD_REQUEST`: Payment amount invalid or exceeds remaining balance.
- `404` — `NOT_FOUND`: Invoice not found or not in a payable status.
- `404` — `NOT_FOUND`: Payment method not found or inactive in this organization.

---

#### POST /invoices/:id/void

Voids an invoice.

| Parameter | Location | Type   | Required | Description |
| --------- | -------- | ------ | -------- | ----------- |
| reason    | body     | string | Yes      | Void reason |

---

#### POST /invoices/:id/send

Sends an invoice email to the customer and transitions the invoice from `draft` to `pending` status. The email contains a formatted breakdown of line items, totals, tax, amount due, and due date.

**Permission:** `invoices:update`

| Parameter | Location | Type   | Required | Description      |
| --------- | -------- | ------ | -------- | ---------------- |
| id        | path     | string | Yes      | Invoice ObjectId |

**Response:** `200 OK`

```json
{
  "status": "success",
  "message": "Invoice sent successfully"
}
```

**Behavior:**

- If the invoice is in `draft` status, it transitions to `pending`.
- If the invoice is already `pending` or another non-draft status, the email is resent but status is unchanged.
- The customer email is resolved from the populated `customerId` field (customer must have a valid email).

**Errors:**

- `404` — `NOT_FOUND`: Invoice not found in this organization.

---

### Analytics Endpoints (Organization)

All analytics endpoints require authentication, an active organization, and the `analytics:read` permission.

#### GET /analytics/overview

Returns a high-level dashboard overview with counts and summaries across all modules.

**Permission:** `analytics:read`

| Parameter | Location | Type   | Required | Description                                              |
| --------- | -------- | ------ | -------- | -------------------------------------------------------- |
| startDate | query    | string | No       | Filter data from this date (ISO 8601, e.g. `2025-01-01`) |
| endDate   | query    | string | No       | Filter data up to this date (ISO 8601)                   |

When date range is provided, counts for customers, loans, requests, and invoices are scoped to entities created within that period. When omitted, all-time totals are returned.

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "customers": {
      "total": 145,
      "active": 120
    },
    "materials": {
      "catalogItems": 52,
      "availableInstances": 380
    },
    "loans": {
      "active": 23,
      "overdue": 4
    },
    "requests": {
      "pending": 7
    },
    "invoices": {
      "total": 210,
      "totalRevenue": 8500000,
      "totalOutstanding": 350000
    }
  }
}
```

---

#### GET /analytics/materials

Returns material utilization statistics: status breakdown across all instances and the top 10 most-used materials (by loan count).

**Permission:** `analytics:read`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "statusBreakdown": [
      { "status": "available", "count": 380 },
      { "status": "loaned", "count": 45 },
      { "status": "maintenance", "count": 12 },
      { "status": "damaged", "count": 3 },
      { "status": "retired", "count": 8 }
    ],
    "topMaterials": [
      {
        "_id": "664abc123def456789012345",
        "loanCount": 47,
        "materialName": "Folding Chair",
        "identifier": "FC-001"
      }
    ]
  }
}
```

---

#### GET /analytics/revenue

Returns monthly revenue and revenue broken down by invoice type. Defaults to the last 12 months when no date range is provided.

**Permission:** `analytics:read`

| Parameter | Location | Type   | Required | Description                                                    |
| --------- | -------- | ------ | -------- | -------------------------------------------------------------- |
| startDate | query    | string | No       | Start of revenue period (ISO 8601). Defaults to 12 months ago. |
| endDate   | query    | string | No       | End of revenue period (ISO 8601). Defaults to now.             |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "monthlyRevenue": [
      {
        "year": 2025,
        "month": 1,
        "revenue": 1200000,
        "invoiceCount": 18
      },
      {
        "year": 2025,
        "month": 2,
        "revenue": 1450000,
        "invoiceCount": 22
      }
    ],
    "revenueByType": [
      { "type": "damage", "revenue": 3200000, "count": 45 },
      { "type": "late_fee", "revenue": 800000, "count": 12 },
      { "type": "deposit_shortfall", "revenue": 200000, "count": 5 }
    ]
  }
}
```

---

#### GET /analytics/customers

Returns customer status breakdown and the top 10 customers ranked by total loan count.

**Permission:** `analytics:read`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "statusBreakdown": [
      { "status": "active", "count": 120 },
      { "status": "inactive", "count": 20 },
      { "status": "blacklisted", "count": 5 }
    ],
    "topCustomers": [
      {
        "_id": "664abc123def456789012345",
        "loanCount": 15,
        "name": {
          "firstName": "Maria",
          "firstSurname": "Garcia"
        },
        "email": "maria@example.com"
      }
    ]
  }
}
```

---

### Reports Endpoints

> **⚠️ Legacy — uso desaconsejado.** Estos endpoints se mantienen por compatibilidad retroactiva, pero se recomienda migrar a los **Report Export Endpoints** (sección siguiente). Los nuevos endpoints ofrecen el parámetro `includeIds` para controlar la presencia de IDs, métricas de negocio enriquecidas (tendencias, comparaciones de periodo, tasas de utilización, rutas top, etc.) y filtros más completos.
>
> **Tabla de migración:**
>
> | Endpoint legacy          | Reemplazo recomendado                | Notas                                                                                                            |
> | ------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
> | `GET /reports/loans`     | `GET /reports/exports/loan-activity` | Métricas de duración, sobrepasos, tendencias mensuales y comparación de periodo                                  |
> | `GET /reports/inventory` | `GET /reports/exports/inventory`     | Desglose por tipo/ubicación con tasas de utilización/disponibilidad/daño                                         |
> | `GET /reports/financial` | `GET /reports/exports/sales`         | Combina préstamos + facturas con revenue breakdown y top clientes                                                |
> | `GET /reports/damages`   | —                                    | Sin reemplazo directo; usa datos de inspección. `/exports/damages` usa datos de mantenimiento (fuente diferente) |
> | `GET /reports/transfers` | `GET /reports/exports/transfers`     | Análisis de rutas, tiempos de tránsito, condición de ítems y comparación de periodo                              |
> | `GET /reports/catalog`   | `GET /reports/exports/catalog`       | Catálogo detallado con disponibilidad por ubicación, ingreso estimado y costo de mantenimiento                   |
> | —                        | `GET /reports/exports/locations`     | Nuevo: catálogo de ubicaciones con capacidades de material, tasas de ocupación y resumen por estado              |
> | —                        | `GET /reports/exports/customers`     | Nuevo: listado de clientes con ingresos reales desde préstamos, top por revenue y por número de préstamos        |
> | —                        | `GET /reports/exports/requests`      | Nuevo: solicitudes de préstamo con embudo de conversión, revenue analytics y comparación de periodo              |

All reports endpoints require authentication, an active organization, and the `reports:read` permission. Reports are designed for operational analysis and support pagination, date-range filtering, and status filtering.

**Common Query Parameters** (all optional):

| Parameter  | Type    | Description                            |
| ---------- | ------- | -------------------------------------- |
| startDate  | string  | Filter from this date (ISO 8601)       |
| endDate    | string  | Filter up to this date (ISO 8601)      |
| status     | string  | Filter by entity status                |
| locationId | string  | Filter by location ObjectId            |
| customerId | string  | Filter by customer ObjectId            |
| page       | integer | Page number (default: 1)               |
| limit      | integer | Items per page (default: 50, max: 200) |

---

#### GET /reports/loans

Loan report with duration, overdue analysis, and summary statistics.

**Permission:** `reports:read`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "loans": [
      {
        "_id": "665a1b2c3d4e5f6a7b8c9d0e",
        "customer": {
          "name": "Maria Garcia",
          "email": "maria@example.com",
          "documentNumber": "1234567890"
        },
        "status": "active",
        "startDate": "2025-07-01T00:00:00.000Z",
        "endDate": "2025-07-15T00:00:00.000Z",
        "materialInstances": [ ... ],
        "durationDays": 14,
        "overdueDays": 3
      }
    ],
    "total": 45,
    "page": 1,
    "totalPages": 1,
    "summary": {
      "totalLoans": 45,
      "statusBreakdown": [
        { "_id": "active", "count": 23 },
        { "_id": "overdue", "count": 4 },
        { "_id": "returned", "count": 18 }
      ]
    }
  }
}
```

**Notes:**

- `durationDays` is computed as the difference between `endDate` and `startDate`.
- `overdueDays` is computed from `endDate` to today (only when the loan is past its end date and not returned).
- `summary.statusBreakdown` aggregates all matching loans (not just the current page).

---

#### GET /reports/inventory

Inventory report showing stock levels by material type and location, with status breakdown.

**Permission:** `reports:read`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "inventory": [
      {
        "materialType": {
          "_id": "664abc123def456789012345",
          "name": "Folding Chair",
          "identifier": "FC"
        },
        "totalInstances": 50,
        "statusBreakdown": [
          { "status": "available", "count": 35 },
          { "status": "loaned", "count": 10 },
          { "status": "maintenance", "count": 3 },
          { "status": "damaged", "count": 2 }
        ],
        "byLocation": [
          {
            "locationId": "664abc123def456789012346",
            "locationName": "Main Warehouse",
            "count": 30
          }
        ]
      }
    ],
    "summary": {
      "totalTypes": 15,
      "totalInstances": 380
    }
  }
}
```

---

#### GET /reports/financial

Financial report with invoice breakdown, revenue by type, and status summary.

**Permission:** `reports:read`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "invoices": [
      {
        "_id": "665a1b2c3d4e5f6a7b8c9d0f",
        "customer": { "name": "Maria Garcia", "email": "maria@example.com" },
        "type": "rental",
        "status": "paid",
        "total": 150000,
        "amountPaid": 150000,
        "amountDue": 0,
        "createdAt": "2025-07-01T00:00:00.000Z",
        "dueDate": "2025-07-15T00:00:00.000Z"
      }
    ],
    "total": 210,
    "page": 1,
    "totalPages": 5,
    "summaryByType": [
      { "_id": "rental", "totalRevenue": 5000000, "count": 120 },
      { "_id": "damage", "totalRevenue": 800000, "count": 15 },
      { "_id": "deposit_shortfall", "totalRevenue": 200000, "count": 5 }
    ],
    "summaryByStatus": [
      { "_id": "paid", "totalAmount": 4500000, "count": 156 },
      { "_id": "pending", "totalAmount": 350000, "count": 12 }
    ]
  }
}
```

---

#### GET /reports/damages

Damage and repairs report from inspection records. Lists individual damaged items with cost information.

**Permission:** `reports:read`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "damages": [
      {
        "inspectionId": "665a1b2c3d4e5f6a7b8c9d10",
        "loanId": "665a1b2c3d4e5f6a7b8c9d0e",
        "customer": { "name": "Carlos Mendez" },
        "inspectedAt": "2025-07-16T10:00:00.000Z",
        "item": {
          "materialInstanceId": "664abc123def456789012347",
          "conditionBefore": "good",
          "conditionAfter": "damaged",
          "damageDescription": "Scratched surface",
          "chargeToCustomer": 25000,
          "estimatedRepairCost": 15000
        }
      }
    ],
    "total": 8,
    "page": 1,
    "totalPages": 1,
    "summary": {
      "totalDamages": 8,
      "totalCharges": 200000,
      "totalRepairCost": 120000
    }
  }
}
```

---

#### GET /reports/transfers

Transfer report with inter-location movement history and status summary.

**Permission:** `reports:read`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "transfers": [
      {
        "_id": "665a1b2c3d4e5f6a7b8c9d11",
        "fromLocation": { "name": "Main Warehouse" },
        "toLocation": { "name": "Event Venue A" },
        "status": "completed",
        "items": [ ... ],
        "notes": "Delivery for weekend event",
        "createdAt": "2025-07-10T08:00:00.000Z"
      }
    ],
    "total": 32,
    "page": 1,
    "totalPages": 1,
    "summaryByStatus": [
      { "_id": "completed", "count": 25 },
      { "_id": "in_transit", "count": 5 },
      { "_id": "pending", "count": 2 }
    ]
  }
}
```

---

### Report Export Endpoints

These endpoints return JSON exports optimized for frontend consumption (the frontend handles CSV/XLSX generation). Each endpoint accepts an `includeIds` query parameter:

- **`includeIds=true`** (default): Returns raw data with MongoDB ObjectIds, suitable for cross-referencing.
- **`includeIds=false`**: Strips all IDs and adds enriched business metrics, period-over-period comparison, and summary analytics suitable for dashboards and reports.

All export endpoints require authentication, an active organization, and the `reports:read` permission.

---

#### GET /reports/exports/sales

Combined loan revenue + invoice sales export. Returns paginated loan and invoice rows.

**Permission:** `reports:read`

**Query Parameters:**

| Parameter     | Type    | Description                                   |
| ------------- | ------- | --------------------------------------------- |
| startDate     | string  | Filter from this date (ISO 8601)              |
| endDate       | string  | Filter up to this date (ISO 8601)             |
| includeIds    | boolean | Include ObjectIds in response (default: true) |
| customerId    | string  | Filter by customer ObjectId                   |
| locationId    | string  | Filter by location ObjectId                   |
| invoiceType   | string  | Filter invoices by type                       |
| invoiceStatus | string  | Filter invoices by status                     |
| categoryId    | string  | Filter loans by material category             |
| page          | integer | Page number (default: 1)                      |
| limit         | integer | Items per page (default: 50, max: 200)        |

**Response (`includeIds=true`):** `200 OK`

```json
{
  "status": "success",
  "data": {
    "loanRows": [
      {
        "loanId": "665a1b2c3d4e5f6a7b8c9d0e",
        "customerId": "665a1b2c3d4e5f6a7b8c9d0f",
        "locationId": "665a1b2c3d4e5f6a7b8c9d10",
        "code": "LN-0042",
        "customerName": "Maria Garcia",
        "customerEmail": "maria@example.com",
        "locationName": "Bodega Principal",
        "startDate": "2025-07-01T00:00:00.000Z",
        "endDate": "2025-07-15T00:00:00.000Z",
        "totalAmount": 350000,
        "depositAmount": 50000,
        "status": "active",
        "materialCount": 5
      }
    ],
    "invoiceRows": [
      {
        "invoiceId": "665a1b2c3d4e5f6a7b8c9d11",
        "customerId": "665a1b2c3d4e5f6a7b8c9d0f",
        "invoiceNumber": "INV-0087",
        "type": "rental",
        "status": "paid",
        "customerName": "Maria Garcia",
        "totalAmount": 350000,
        "amountPaid": 350000,
        "amountDue": 0,
        "dueDate": "2025-07-15T00:00:00.000Z",
        "createdAt": "2025-07-01T00:00:00.000Z"
      }
    ],
    "pagination": { "total": 45, "page": 1, "totalPages": 1 }
  }
}
```

**Response (`includeIds=false`):** `200 OK`

When `includeIds=false`, IDs are omitted from rows and a `summary` object is added:

```json
{
  "status": "success",
  "data": {
    "loanRows": [ { "code": "LN-0042", "customerName": "...", ... } ],
    "invoiceRows": [ { "invoiceNumber": "INV-0087", ... } ],
    "pagination": { "total": 45, "page": 1, "totalPages": 1 },
    "summary": {
      "totalLoanRevenue": 12500000,
      "totalInvoiceRevenue": 8700000,
      "combinedRevenue": 21200000,
      "averageLoanValue": 278000,
      "revenueByMonth": [
        { "year": 2025, "month": 6, "loanRevenue": 5000000, "invoiceRevenue": 3200000, "total": 8200000 },
        { "year": 2025, "month": 7, "loanRevenue": 7500000, "invoiceRevenue": 5500000, "total": 13000000 }
      ],
      "revenueByInvoiceType": [
        { "type": "rental", "revenue": 6500000, "count": 42 },
        { "type": "damage", "revenue": 1200000, "count": 8 }
      ],
      "topCustomersByRevenue": [
        { "customerName": "Maria Garcia", "totalRevenue": 2500000, "loanCount": 12 }
      ],
      "periodComparison": {
        "currentTotal": 21200000,
        "previousTotal": 18000000,
        "percentChange": 17.78
      }
    }
  }
}
```

**Notes:**

- `periodComparison` is included only when both `startDate` and `endDate` are provided. It compares the selected period against the immediately preceding period of equal duration.
- `revenueByMonth` merges loan and invoice revenue into a single timeline.

---

#### GET /reports/exports/catalog

Detailed material catalog export with per-location/status instance breakdown.

**Permission:** `reports:read`

**Query Parameters:**

| Parameter  | Type    | Description                                      |
| ---------- | ------- | ------------------------------------------------ |
| includeIds | boolean | Include ObjectIds in response (default: true)    |
| categoryId | string  | Filter by material category ObjectId             |
| locationId | string  | Filter instances by location ObjectId            |
| search     | string  | Search material types by name (case-insensitive) |
| status     | string  | Filter instances by status                       |

**Response (`includeIds=true`):** `200 OK`

```json
{
  "status": "success",
  "data": {
    "exportedAt": "2025-07-15T10:00:00.000Z",
    "totalMaterialTypes": 25,
    "materialTypes": [
      {
        "materialTypeId": "664abc123def456789012345",
        "categoryIds": ["664abc123def456789012350"],
        "code": "MT-0012",
        "name": "Silla Plegable",
        "description": "Silla plegable metálica",
        "pricePerDay": 5000,
        "categoryNames": ["Mobiliario"],
        "totalInstances": 50,
        "instancesByStatus": {
          "available": 35,
          "loaned": 10,
          "damaged": 3,
          "maintenance": 2
        },
        "locationBreakdown": [
          {
            "locationName": "Bodega Principal",
            "locationId": "664abc123def456789012346",
            "count": 30
          }
        ]
      }
    ]
  }
}
```

**Response (`includeIds=false`):** `200 OK`

When `includeIds=false`, IDs are omitted and each material type includes enriched metrics. A global `summary` is also added:

```json
{
  "status": "success",
  "data": {
    "exportedAt": "2025-07-15T10:00:00.000Z",
    "totalMaterialTypes": 25,
    "materialTypes": [
      {
        "code": "MT-0012",
        "name": "Silla Plegable",
        "description": "Silla plegable metálica",
        "pricePerDay": 5000,
        "categoryNames": ["Mobiliario"],
        "totalInstances": 50,
        "instancesByStatus": {
          "available": 35,
          "loaned": 10,
          "damaged": 3,
          "maintenance": 2
        },
        "locationBreakdown": [
          { "locationName": "Bodega Principal", "count": 30 }
        ],
        "utilizationRate": 20.0,
        "availabilityRate": 70.0,
        "damageRate": 6.0,
        "totalRevenue": 1250000,
        "totalLoans": 45,
        "averageLoanDurationDays": 5,
        "maintenanceCostTotal": 75000
      }
    ],
    "summary": {
      "totalCatalogItems": 25,
      "totalInstances": 380,
      "globalAvailabilityRate": 68.42,
      "globalUtilizationRate": 22.37,
      "instancesByStatus": [
        { "status": "available", "count": 260 },
        { "status": "loaned", "count": 85 }
      ],
      "topRevenueGenerators": [
        { "name": "Silla Plegable", "totalRevenue": 1250000, "totalLoans": 45 }
      ]
    }
  }
}
```

**Notes:**

- `utilizationRate`, `availabilityRate`, and `damageRate` are percentages (0–100) with two decimal places.
- `maintenanceCostTotal` is derived from MaintenanceBatch items linked to the material type.

---

#### GET /reports/exports/loan-activity

Loan activity export with duration and overdue analysis. Returns paginated loan rows.

**Permission:** `reports:read`

**Query Parameters:**

| Parameter  | Type    | Description                                   |
| ---------- | ------- | --------------------------------------------- |
| startDate  | string  | Filter from this date (ISO 8601)              |
| endDate    | string  | Filter up to this date (ISO 8601)             |
| includeIds | boolean | Include ObjectIds in response (default: true) |
| customerId | string  | Filter by customer ObjectId                   |
| locationId | string  | Filter by location ObjectId                   |
| status     | string  | Filter by loan status                         |
| page       | integer | Page number (default: 1)                      |
| limit      | integer | Items per page (default: 50, max: 200)        |

**Response (`includeIds=true`):** `200 OK`

```json
{
  "status": "success",
  "data": {
    "rows": [
      {
        "loanId": "665a1b2c3d4e5f6a7b8c9d0e",
        "customerId": "665a1b2c3d4e5f6a7b8c9d0f",
        "locationId": "665a1b2c3d4e5f6a7b8c9d10",
        "code": "LN-0042",
        "customerName": "Maria Garcia",
        "locationName": "Bodega Principal",
        "status": "active",
        "startDate": "2025-07-01T00:00:00.000Z",
        "endDate": "2025-07-15T00:00:00.000Z",
        "returnedAt": null,
        "durationDays": 14,
        "overdueDays": 0,
        "totalAmount": 350000,
        "materialCount": 5
      }
    ],
    "pagination": { "total": 45, "page": 1, "totalPages": 1 }
  }
}
```

**Response (`includeIds=false`):** `200 OK`

When `includeIds=false`, IDs are omitted and an enriched `summary` is added:

```json
{
  "status": "success",
  "data": {
    "rows": [ { "code": "LN-0042", "customerName": "...", ... } ],
    "pagination": { "total": 45, "page": 1, "totalPages": 1 },
    "summary": {
      "totalLoans": 45,
      "totalRevenue": 12500000,
      "averageDurationDays": 7,
      "overdueRate": 8.89,
      "returnRate": 75.56,
      "loansByMonth": [
        { "year": 2025, "month": 7, "count": 28, "totalAmount": 8000000 }
      ],
      "loansByStatus": [
        { "status": "active", "count": 23, "totalAmount": 6500000 }
      ],
      "topMaterials": [
        { "materialName": "Silla Plegable", "loanCount": 32 }
      ],
      "topCustomers": [
        { "customerName": "Maria Garcia", "loanCount": 12, "totalAmount": 2500000 }
      ],
      "periodComparison": {
        "currentCount": 45,
        "previousCount": 38,
        "percentChange": 18.42,
        "currentRevenue": 12500000,
        "previousRevenue": 10200000,
        "revenuePercentChange": 22.55
      }
    }
  }
}
```

**Notes:**

- `overdueRate` and `returnRate` are percentages (0–100) with two decimal places.
- `returnRate` counts loans with status `returned` or `closed`.
- `periodComparison` is only included when both `startDate` and `endDate` are provided.

---

#### GET /reports/exports/damages

Maintenance batch and damage cost export. Returns paginated batch rows and individual item-level detail.

**Permission:** `reports:read`

**Query Parameters:**

| Parameter   | Type    | Description                                       |
| ----------- | ------- | ------------------------------------------------- |
| startDate   | string  | Filter from this date (ISO 8601)                  |
| endDate     | string  | Filter up to this date (ISO 8601)                 |
| includeIds  | boolean | Include ObjectIds in response (default: true)     |
| locationId  | string  | Filter by location ObjectId                       |
| batchStatus | string  | Filter by maintenance batch status                |
| entryReason | string  | Filter items by entry reason (damaged/lost/other) |
| page        | integer | Page number (default: 1)                          |
| limit       | integer | Items per page (default: 50, max: 200)            |

**Response (`includeIds=true`):** `200 OK`

```json
{
  "status": "success",
  "data": {
    "batches": [
      {
        "batchId": "665a1b2c3d4e5f6a7b8c9d12",
        "locationId": "665a1b2c3d4e5f6a7b8c9d10",
        "batchNumber": "MB-0005",
        "name": "Reparación julio",
        "status": "in_progress",
        "locationName": "Bodega Principal",
        "assignedTo": "Carlos Lopez",
        "totalEstimatedCost": 250000,
        "totalActualCost": 180000,
        "startedAt": "2025-07-10T08:00:00.000Z",
        "completedAt": null,
        "itemCount": 8
      }
    ],
    "items": [
      {
        "materialInstanceId": "664abc123def456789012347",
        "batchNumber": "MB-0005",
        "serialNumber": "SN-00123",
        "materialTypeName": "Silla Plegable",
        "entryReason": "damaged",
        "itemStatus": "in_repair",
        "estimatedCost": 35000,
        "actualCost": 28000,
        "repairNotes": "Pata doblada, requiere soldadura",
        "sourceType": "inspection",
        "resolvedAt": null
      }
    ],
    "pagination": { "total": 12, "page": 1, "totalPages": 1 }
  }
}
```

**Response (`includeIds=false`):** `200 OK`

When `includeIds=false`, IDs are omitted and an enriched `summary` is added:

```json
{
  "status": "success",
  "data": {
    "batches": [ { "batchNumber": "MB-0005", ... } ],
    "items": [ { "batchNumber": "MB-0005", "serialNumber": "SN-00123", ... } ],
    "pagination": { "total": 12, "page": 1, "totalPages": 1 },
    "summary": {
      "totalBatches": 12,
      "totalItems": 47,
      "totalEstimatedCost": 1500000,
      "totalActualCost": 1100000,
      "costVariance": -400000,
      "costVariancePercent": -26.67,
      "costByEntryReason": [
        { "reason": "damaged", "estimatedCost": 1000000, "actualCost": 750000, "itemCount": 30 },
        { "reason": "lost", "estimatedCost": 400000, "actualCost": 300000, "itemCount": 12 }
      ],
      "costByMonth": [
        { "year": 2025, "month": 7, "estimatedCost": 800000, "actualCost": 600000, "batchCount": 5 }
      ],
      "mostDamagedMaterials": [
        { "materialTypeName": "Silla Plegable", "incidentCount": 15, "totalCost": 450000 }
      ],
      "averageRepairTimeDays": 4,
      "resolutionBreakdown": [
        { "status": "repaired", "count": 25 },
        { "status": "unrecoverable", "count": 8 },
        { "status": "in_repair", "count": 10 }
      ],
      "periodComparison": {
        "currentCost": 1100000,
        "previousCost": 950000,
        "percentChange": 15.79,
        "currentItemCount": 47,
        "previousItemCount": 39,
        "itemCountPercentChange": 20.51
      }
    }
  }
}
```

**Notes:**

- `costVariance` = `totalActualCost - totalEstimatedCost`. Negative values indicate costs came in below estimates.
- `costVariancePercent` represents the percentage difference.
- `periodComparison` is only included when both `startDate` and `endDate` are provided.
- The `items` array respects the `entryReason` filter (e.g., only damaged items), even though `batches` shows full batch data.

---

#### GET /reports/exports/inventory

Inventory export grouped by material type and location. When `includeIds=false`, includes utilization, availability, damage, and maintenance rates, estimated daily catalog value, and top materials/locations by stock.

**Permission:** `reports:read`

**Query Parameters:**

| Parameter  | Type   | Description                                                            |
| ---------- | ------ | ---------------------------------------------------------------------- |
| includeIds | string | `"true"` (default) includes IDs; `"false"` omits them and adds summary |
| locationId | string | Filter by location ObjectId                                            |
| categoryId | string | Filter by category ObjectId                                            |
| status     | string | Filter by instance status (e.g., `available`, `loaned`, `damaged`)     |
| search     | string | Search material type name (case-insensitive regex)                     |

**Example Request:**

```
GET /api/v1/reports/exports/inventory?includeIds=false&status=available
Authorization: Bearer <token>
x-organization-id: <org-id>
```

**Success Response (200) — `includeIds=true`:**

```json
{
  "status": "success",
  "data": {
    "totalInstances": 150,
    "byMaterialType": [
      {
        "materialTypeId": "665...",
        "materialTypeName": "Proyector Epson",
        "code": "MAT-001",
        "pricePerDay": 15000,
        "categoryNames": ["Electrónica"],
        "totalInstances": 30,
        "instancesByStatus": { "available": 20, "loaned": 8, "damaged": 2 }
      }
    ],
    "byLocation": [
      {
        "locationId": "664...",
        "locationName": "Sede Principal",
        "totalInstances": 80,
        "instancesByStatus": { "available": 50, "loaned": 25, "maintenance": 5 }
      }
    ]
  }
}
```

**Success Response (200) — `includeIds=false` (additional `summary`):**

```json
{
  "status": "success",
  "data": {
    "totalInstances": 150,
    "byMaterialType": ["..."],
    "byLocation": ["..."],
    "summary": {
      "totalInstances": 150,
      "totalMaterialTypes": 12,
      "totalLocations": 5,
      "globalInstancesByStatus": [
        { "status": "available", "count": 80 },
        { "status": "loaned", "count": 50 },
        { "status": "damaged", "count": 10 },
        { "status": "maintenance", "count": 10 }
      ],
      "availabilityRate": 53.33,
      "utilizationRate": 33.33,
      "damageRate": 6.67,
      "maintenanceRate": 6.67,
      "estimatedDailyValue": 2250000,
      "topMaterialTypesByStock": [{ "name": "Proyector Epson", "total": 30 }],
      "topLocationsByStock": [{ "name": "Sede Principal", "total": 80 }]
    }
  }
}
```

**Error Responses:**

| Status | Condition                          |
| ------ | ---------------------------------- |
| 400    | Query parameter validation failure |
| 401    | Not authenticated                  |
| 403    | Missing `reports:read` permission  |

---

#### GET /reports/exports/transfers

Transfer export with condition tracking, paginated rows, and enriched metrics (transit time, completion/issue rates, route analysis, condition breakdown, period comparison) when `includeIds=false`.

**Permission:** `reports:read`

**Query Parameters:**

| Parameter      | Type    | Description                                                                       |
| -------------- | ------- | --------------------------------------------------------------------------------- |
| startDate      | string  | Filter from this date (ISO 8601)                                                  |
| endDate        | string  | Filter up to this date (ISO 8601)                                                 |
| includeIds     | string  | `"true"` (default) includes IDs; `"false"` omits them and adds summary            |
| status         | string  | Filter by transfer status (`picking`, `in_transit`, `received`, `issue_reported`) |
| fromLocationId | string  | Filter by origin location ObjectId                                                |
| toLocationId   | string  | Filter by destination location ObjectId                                           |
| page           | integer | Page number (default: 1)                                                          |
| limit          | integer | Items per page (default: 50, max: 200)                                            |

**Example Request:**

```
GET /api/v1/reports/exports/transfers?includeIds=false&startDate=2025-01-01&endDate=2025-06-30
Authorization: Bearer <token>
x-organization-id: <org-id>
```

**Success Response (200) — `includeIds=true`:**

```json
{
  "status": "success",
  "data": {
    "rows": [
      {
        "transferId": "665...",
        "fromLocationId": "664a...",
        "toLocationId": "664b...",
        "status": "received",
        "fromLocation": "Sede Principal",
        "toLocation": "Sucursal Norte",
        "itemCount": 5,
        "pickedBy": "Juan Pérez",
        "receivedBy": "María López",
        "sentAt": "2025-03-10T08:00:00.000Z",
        "receivedAt": "2025-03-12T14:30:00.000Z",
        "transitDays": 3,
        "senderNotes": null,
        "receiverNotes": "Todo en orden",
        "createdAt": "2025-03-10T07:50:00.000Z"
      }
    ],
    "pagination": {
      "total": 42,
      "page": 1,
      "totalPages": 1
    }
  }
}
```

**Success Response (200) — `includeIds=false` (additional `summary`):**

```json
{
  "status": "success",
  "data": {
    "rows": ["..."],
    "pagination": { "total": 42, "page": 1, "totalPages": 1 },
    "summary": {
      "totalTransfers": 42,
      "totalItemsMoved": 185,
      "averageTransitDays": 2,
      "completionRate": 85.71,
      "issueRate": 4.76,
      "transfersByStatus": [
        { "status": "received", "count": 36, "totalItems": 160 },
        { "status": "in_transit", "count": 4, "totalItems": 15 }
      ],
      "transfersByMonth": [
        { "year": 2025, "month": 1, "count": 8, "totalItems": 30 },
        { "year": 2025, "month": 2, "count": 10, "totalItems": 45 }
      ],
      "receivedConditionBreakdown": [
        { "condition": "good", "count": 140 },
        { "condition": "damaged", "count": 12 }
      ],
      "topRoutes": [
        {
          "fromLocation": "Sede Principal",
          "toLocation": "Sucursal Norte",
          "transferCount": 15,
          "totalItems": 60
        }
      ],
      "periodComparison": {
        "currentTransfers": 42,
        "previousTransfers": 35,
        "percentChange": 20.0,
        "currentItems": 185,
        "previousItems": 150,
        "itemsPercentChange": 23.33
      }
    }
  }
}
```

**Notes:**

- `transitDays` is calculated only when both `sentAt` and `receivedAt` exist.
- `periodComparison` is included only when both `startDate` and `endDate` are provided.
- `topRoutes` returns the 10 most-used origin→destination pairs.
- `receivedConditionBreakdown` reflects the condition of items at reception.

**Error Responses:**

| Status | Condition                          |
| ------ | ---------------------------------- |
| 400    | Query parameter validation failure |
| 401    | Not authenticated                  |
| 403    | Missing `reports:read` permission  |

---

#### GET /reports/exports/billing-history

Billing history export with subscription lifecycle events, payment tracking, and cost analytics. When `includeIds=false`, includes event breakdown by type/month, payment summary per currency, payment success rate, plan change history, and period comparison.

**Permissions:** `reports:read` **AND** `billing:manage`

**Query Parameters:**

| Parameter  | Type    | Description                                                                                 |
| ---------- | ------- | ------------------------------------------------------------------------------------------- |
| startDate  | string  | Filter from this date (ISO 8601)                                                            |
| endDate    | string  | Filter up to this date (ISO 8601)                                                           |
| includeIds | string  | `"true"` (default) includes IDs; `"false"` omits them and adds summary                      |
| eventType  | string  | Filter by event type (e.g., `payment_succeeded`, `plan_upgraded`, `subscription_cancelled`) |
| page       | integer | Page number (default: 1)                                                                    |
| limit      | integer | Items per page (default: 50, max: 200)                                                      |

**Valid `eventType` values:** `subscription_created`, `subscription_updated`, `subscription_cancelled`, `payment_succeeded`, `payment_failed`, `invoice_paid`, `invoice_payment_failed`, `seat_added`, `seat_removed`, `plan_upgraded`, `plan_downgraded`.

**Example Request:**

```
GET /api/v1/reports/exports/billing-history?includeIds=false&startDate=2025-01-01&endDate=2025-12-31
Authorization: Bearer <token>
x-organization-id: <org-id>
```

**Success Response (200) — `includeIds=true`:**

```json
{
  "status": "success",
  "data": {
    "currentSubscription": {
      "plan": "professional",
      "seatCount": 10,
      "currentPeriodStart": "2025-06-01T00:00:00.000Z",
      "currentPeriodEnd": "2025-07-01T00:00:00.000Z",
      "cancelAtPeriodEnd": false,
      "pendingPlan": null,
      "pendingPlanEffectiveDate": null
    },
    "rows": [
      {
        "eventId": "665...",
        "stripeEventId": "evt_...",
        "stripeSubscriptionId": "sub_...",
        "stripeInvoiceId": "in_...",
        "stripePaymentIntentId": null,
        "eventType": "payment_succeeded",
        "amount": 50000,
        "currency": "usd",
        "previousPlan": null,
        "newPlan": null,
        "seatChange": null,
        "processed": true,
        "error": null,
        "createdAt": "2025-06-01T00:05:00.000Z"
      }
    ],
    "pagination": {
      "total": 24,
      "page": 1,
      "totalPages": 1
    }
  }
}
```

**Success Response (200) — `includeIds=false` (additional `summary`):**

```json
{
  "status": "success",
  "data": {
    "currentSubscription": { "..." },
    "rows": [ "..." ],
    "pagination": { "total": 24, "page": 1, "totalPages": 1 },
    "summary": {
      "totalEvents": 24,
      "eventsByType": [
        { "eventType": "payment_succeeded", "count": 12 },
        { "eventType": "subscription_updated", "count": 6 },
        { "eventType": "plan_upgraded", "count": 2 }
      ],
      "eventsByMonth": [
        { "year": 2025, "month": 1, "count": 2, "totalAmount": 100000 },
        { "year": 2025, "month": 2, "count": 3, "totalAmount": 150000 }
      ],
      "paymentSummary": [
        {
          "currency": "usd",
          "totalPaid": 600000,
          "paymentCount": 12,
          "averagePayment": 50000
        }
      ],
      "paymentSuccessRate": 92.31,
      "failedPaymentCount": 1,
      "planChangeHistory": [
        {
          "eventType": "plan_upgraded",
          "previousPlan": "starter",
          "newPlan": "professional",
          "seatChange": 10,
          "createdAt": "2025-03-15T10:00:00.000Z"
        }
      ],
      "periodComparison": {
        "currentEvents": 24,
        "previousEvents": 18,
        "eventsPercentChange": 33.33,
        "currentAmountPaid": 600000,
        "previousAmountPaid": 450000,
        "amountPercentChange": 33.33
      }
    }
  }
}
```

**Notes:**

- `amount` values are in the smallest currency unit (e.g., cents for USD).
- `periodComparison` is included only when both `startDate` and `endDate` are provided.
- `currentSubscription` always reflects the organization's live subscription state, regardless of filters.
- `paymentSuccessRate` considers both `payment_succeeded`/`invoice_paid` (success) and `payment_failed`/`invoice_payment_failed` (failure).

**Error Responses:**

| Status | Condition                                             |
| ------ | ----------------------------------------------------- |
| 400    | Query parameter validation failure                    |
| 401    | Not authenticated                                     |
| 403    | Missing `reports:read` or `billing:manage` permission |

---

#### GET /reports/exports/locations

Location catalog export with material capacity detail and summary. When `includeIds=false`, adds occupancy analytics, status breakdown, and top locations by occupancy.

**Permission:** `reports:read`

**Query Parameters:**

| Parameter  | Type    | Default | Description                                           |
| ---------- | ------- | ------- | ----------------------------------------------------- |
| includeIds | boolean | `true`  | Include ObjectIds in the output                       |
| locationId | string  | —       | Filter by specific location ID                        |
| status     | string  | —       | Filter by status (`available`, `full_capacity`, etc.) |
| isActive   | boolean | —       | Filter by active/inactive state                       |
| search     | string  | —       | Partial match on location name (case-insensitive)     |

**Example Request:**

```
GET /api/v1/reports/exports/locations?includeIds=false&status=available
```

**Success Response (includeIds=false):**

```json
{
  "status": "success",
  "data": {
    "totalLocations": 5,
    "locations": [
      {
        "name": "Bodega Central",
        "code": "BC01",
        "status": "available",
        "isActive": true,
        "address": {
          "street": "Calle 10 #5-30",
          "city": "Bogotá",
          "state": "Cundinamarca",
          "country": "CO"
        },
        "additionalDetails": null,
        "materialCapacitiesDetail": [
          {
            "typeName": "Silla plegable",
            "maxQuantity": 200,
            "currentQuantity": 150
          },
          {
            "typeName": "Mesa redonda",
            "maxQuantity": 50,
            "currentQuantity": 30
          }
        ],
        "materialCapacitiesSummary": {
          "totalCapacity": 250,
          "totalOccupied": 180,
          "occupancyRate": 72
        },
        "createdAt": "2025-01-10T08:00:00.000Z",
        "updatedAt": "2025-06-01T12:00:00.000Z"
      }
    ],
    "summary": {
      "totalLocations": 5,
      "byStatus": [
        { "status": "available", "count": 3 },
        { "status": "full_capacity", "count": 1 },
        { "status": "maintenance", "count": 1 }
      ],
      "byActive": { "active": 4, "inactive": 1 },
      "avgOccupancyRate": 65.5,
      "totalCapacity": 1200,
      "totalOccupied": 786,
      "topByOccupancy": [
        { "name": "Bodega Norte", "code": "BN01", "occupancyRate": 95.2 }
      ]
    }
  }
}
```

**Notes:**

- No pagination — returns all matching locations (catalog-style).
- `materialCapacitiesDetail` includes resolved material type names via lookup.
- `materialCapacitiesSummary` provides a per-location rollup of capacity.
- `summary` is only included when `includeIds=false`.

**Error Responses:**

| Status | Condition                          |
| ------ | ---------------------------------- |
| 400    | Query parameter validation failure |
| 401    | Not authenticated                  |
| 403    | Missing `reports:read` permission  |

---

#### GET /reports/exports/customers

Customer export with real revenue calculated from Loans. When `includeIds=false`, includes global revenue stats, top customers by revenue and loan count, and period comparison on `createdAt`.

**Permission:** `reports:read`

**Query Parameters:**

| Parameter    | Type    | Default | Description                                            |
| ------------ | ------- | ------- | ------------------------------------------------------ |
| includeIds   | boolean | `true`  | Include ObjectIds in the output                        |
| status       | string  | —       | Filter by status (`active`, `inactive`, `blacklisted`) |
| search       | string  | —       | Search by firstName, firstSurname, email, or document  |
| documentType | string  | —       | Filter by document type (`cc`, `ce`, `passport`, etc.) |
| startDate    | date    | —       | Filter customers created from this date                |
| endDate      | date    | —       | Filter customers created up to this date               |
| page         | number  | `1`     | Page number                                            |
| limit        | number  | `50`    | Items per page (max 200)                               |

**Example Request:**

```
GET /api/v1/reports/exports/customers?includeIds=false&status=active&startDate=2025-01-01&endDate=2025-06-30
```

**Success Response (includeIds=false):**

```json
{
  "status": "success",
  "data": {
    "total": 120,
    "page": 1,
    "limit": 50,
    "customers": [
      {
        "fullName": "María García López",
        "email": "maria@example.com",
        "phone": "+573001234567",
        "documentType": "cc",
        "documentNumber": "1234567890",
        "status": "active",
        "totalLoans": 8,
        "activeLoans": 2,
        "totalRevenue": 1500000,
        "avgLoanAmount": 187500,
        "lastLoanAt": "2025-06-15T10:00:00.000Z",
        "createdAt": "2025-01-05T09:00:00.000Z"
      }
    ],
    "summary": {
      "totalCustomers": 120,
      "byStatus": [
        { "status": "active", "count": 100 },
        { "status": "inactive", "count": 15 },
        { "status": "blacklisted", "count": 5 }
      ],
      "totalRevenue": 45000000,
      "totalLoans": 350,
      "topByRevenue": [{ "fullName": "María García", "totalRevenue": 5000000 }],
      "topByLoanCount": [{ "fullName": "Carlos Pérez", "loanCount": 25 }],
      "periodComparison": {
        "currentNewCustomers": 30,
        "previousNewCustomers": 22,
        "percentChange": 36.36
      }
    }
  }
}
```

**Notes:**

- Revenue is calculated by aggregating `totalAmount` from the Loan model per customer.
- `topByRevenue` and `topByLoanCount` are global (not affected by pagination).
- `periodComparison` compares new customers in the selected date range vs. the previous equal-length period. Only included when both `startDate` and `endDate` are provided.
- `summary` is only included when `includeIds=false`.

**Error Responses:**

| Status | Condition                          |
| ------ | ---------------------------------- |
| 400    | Query parameter validation failure |
| 401    | Not authenticated                  |
| 403    | Missing `reports:read` permission  |

---

#### GET /reports/exports/requests

Loan request export with full conversion funnel analytics, monthly breakdown, and period comparison when `includeIds=false`. Supports dual date filters: `createdAtStart/End` on the request creation date and `loanStartFrom/To` on the requested loan start date.

**Permission:** `reports:read`

**Query Parameters:**

| Parameter      | Type    | Default | Description                                                         |
| -------------- | ------- | ------- | ------------------------------------------------------------------- |
| includeIds     | boolean | `true`  | Include ObjectIds in the output                                     |
| createdAtStart | date    | —       | Filter requests created from this date                              |
| createdAtEnd   | date    | —       | Filter requests created up to this date                             |
| loanStartFrom  | date    | —       | Filter by requested loan start date (from)                          |
| loanStartTo    | date    | —       | Filter by requested loan start date (to)                            |
| status         | string  | —       | Filter by request status (`pending`, `approved`, `completed`, etc.) |
| customerId     | string  | —       | Filter by customer ID                                               |
| page           | number  | `1`     | Page number                                                         |
| limit          | number  | `50`    | Items per page (max 200)                                            |

**Example Request:**

```
GET /api/v1/reports/exports/requests?includeIds=false&createdAtStart=2025-01-01&createdAtEnd=2025-06-30
```

**Success Response (includeIds=false):**

```json
{
  "status": "success",
  "data": {
    "total": 250,
    "page": 1,
    "limit": 50,
    "requests": [
      {
        "code": "REQ-2025-0042",
        "status": "completed",
        "itemCount": 3,
        "totalAmount": 450000,
        "subtotal": 500000,
        "discountAmount": 50000,
        "depositAmount": 100000,
        "totalDays": 7,
        "startDate": "2025-03-10T00:00:00.000Z",
        "endDate": "2025-03-17T00:00:00.000Z",
        "approvedAt": "2025-03-08T14:30:00.000Z",
        "rejectionReason": null,
        "createdAt": "2025-03-07T10:00:00.000Z"
      }
    ],
    "summary": {
      "totalRequests": 250,
      "byStatus": [
        { "status": "completed", "count": 120 },
        { "status": "approved", "count": 40 },
        { "status": "pending", "count": 30 },
        { "status": "rejected", "count": 25 },
        { "status": "cancelled", "count": 15 },
        { "status": "expired", "count": 20 }
      ],
      "byMonth": [
        { "year": 2025, "month": 1, "count": 35, "totalAmount": 8500000 },
        { "year": 2025, "month": 2, "count": 42, "totalAmount": 10200000 }
      ],
      "funnel": {
        "approvalRate": 76.4,
        "completionRate": 48,
        "rejectionRate": 10,
        "cancellationRate": 6,
        "avgApprovalTimeHours": 18.5
      },
      "avgRequestValue": 380000,
      "avgDuration": 5,
      "totalRevenue": 95000000,
      "periodComparison": {
        "currentRequests": 250,
        "previousRequests": 200,
        "requestsPercentChange": 25,
        "currentRevenue": 95000000,
        "previousRevenue": 78000000,
        "revenuePercentChange": 21.79
      }
    }
  }
}
```

**Notes:**

- `itemCount` is the number of items in the request (no item detail array is included).
- The **funnel** counts "approved" as all requests that reached any post-approval status (approved, deposit_pending, assigned, ready, shipped, completed).
- `avgApprovalTimeHours` is `null` when no requests have `approvedAt`.
- `periodComparison` uses `createdAtStart/End` to define the comparison window. Only included when both are provided.
- `summary` is only included when `includeIds=false`.

**Error Responses:**

| Status | Condition                          |
| ------ | ---------------------------------- |
| 400    | Query parameter validation failure |
| 401    | Not authenticated                  |
| 403    | Missing `reports:read` permission  |

---

#### Frontend Consumption Guide

These export endpoints return JSON. The frontend is responsible for converting to CSV/XLSX if needed.

**Recommended workflow:**

1. **Fetch data** with `includeIds=false` for dashboard reports or `includeIds=true` when IDs are needed for linking.
2. **Apply pagination** using `page` and `limit` query params. The `pagination` object in the response tells total items and pages.
3. **Generate files** client-side using a library such as `xlsx` (SheetJS) or `papaparse`:
   ```js
   // Example with SheetJS
   import * as XLSX from "xlsx";
   const wb = XLSX.utils.book_new();
   XLSX.utils.book_append_sheet(
     wb,
     XLSX.utils.json_to_sheet(data.loanRows),
     "Loans",
   );
   XLSX.utils.book_append_sheet(
     wb,
     XLSX.utils.json_to_sheet(data.invoiceRows),
     "Invoices",
   );
   XLSX.writeFile(wb, "sales-export.xlsx");
   ```
4. **Period comparison** is automatic when `startDate` and `endDate` are both provided — the API compares against the immediately preceding period of equal duration.

---

### Error Codes Reference

| HTTP Status | Code                     | Description                       |
| ----------- | ------------------------ | --------------------------------- |
| 400         | `BAD_REQUEST`            | Invalid request parameters        |
| 400         | `PLAN_LIMIT_REACHED`     | Organization limit exceeded       |
| 401         | `UNAUTHORIZED`           | Authentication required or failed |
| 401         | `ORGANIZATION_SUSPENDED` | Organization suspended            |
| 403         | `FORBIDDEN`              | Insufficient permissions          |
| 404         | `NOT_FOUND`              | Resource not found                |
| 409         | `CONFLICT`               | Resource already exists           |
| 429         | `RATE_LIMIT_EXCEEDED`    | Too many requests                 |
| 500         | `INTERNAL_ERROR`         | Server error                      |

---

### Operations Endpoints (Location Dashboard)

The Operations module provides pre-computed, aggregation-driven endpoints that power an operational dashboard scoped to a single location. Each endpoint returns actionable data (not raw CRUD) — think of it as a TO-DO list for the warehouse operator or manager at a given location.

**Base path:** `/api/v1/locations/:locationId/operations`

**Permission required for ALL endpoints:** `operations:read`

**Middleware chain:** `authenticate` → `requireActiveOrganization` → `requirePermission("operations:read")`

All endpoints validate that `:locationId` belongs to the requesting user's organization before returning data.

---

#### GET /locations/:locationId/operations/overview

Returns a high-level KPI snapshot for the location: active loans, pending inspections, overdue invoices, and items needing attention.

| Parameter  | Location | Type   | Required | Description                      |
| ---------- | -------- | ------ | -------- | -------------------------------- |
| locationId | path     | string | Yes      | MongoDB ObjectId of the location |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "overview": {
      "activeLoans": 12,
      "pendingInspections": 3,
      "overdueInvoices": 2,
      "overdueInvoiceTotal": 1500.5,
      "damagedItems": 4,
      "maintenanceItems": 1,
      "pendingTransfers": 2,
      "expiringLoansNext48h": 5
    }
  }
}
```

**Error Responses:**

| Status | Code          | Description                                  |
| ------ | ------------- | -------------------------------------------- |
| 400    | `BAD_REQUEST` | Invalid locationId format                    |
| 404    | `NOT_FOUND`   | Location not found or does not belong to org |

---

#### GET /locations/:locationId/operations/inspections

Returns the inspection queue for the location: items pending or in-progress inspection, grouped by urgency.

| Parameter  | Location | Type   | Required | Description                      |
| ---------- | -------- | ------ | -------- | -------------------------------- |
| locationId | path     | string | Yes      | MongoDB ObjectId of the location |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "inspectionQueue": {
      "pending": [
        {
          "inspectionId": "665...",
          "loanId": "664...",
          "customerName": "John Doe",
          "returnedAt": "2024-06-01T10:00:00Z",
          "itemCount": 3,
          "status": "pending"
        }
      ],
      "inProgress": [
        {
          "inspectionId": "665...",
          "loanId": "664...",
          "customerName": "Jane Smith",
          "returnedAt": "2024-05-30T14:00:00Z",
          "itemCount": 2,
          "status": "in_progress"
        }
      ]
    }
  }
}
```

---

#### GET /locations/:locationId/operations/financials/overdue

Returns overdue invoices for the location with customer details and amounts, enabling the team to prioritize collection follow-ups.

| Parameter  | Location | Type   | Required | Description                      |
| ---------- | -------- | ------ | -------- | -------------------------------- |
| locationId | path     | string | Yes      | MongoDB ObjectId of the location |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "overdueFinancials": {
      "totalOverdue": 2500.0,
      "invoices": [
        {
          "invoiceId": "665...",
          "loanId": "664...",
          "customerId": "663...",
          "customerName": "John Doe",
          "amountDue": 1200.0,
          "dueDate": "2024-05-15T00:00:00Z",
          "daysOverdue": 17,
          "status": "overdue"
        }
      ]
    }
  }
}
```

---

#### GET /locations/:locationId/operations/inventory/issues

Returns inventory problems at the location: items in `damaged`, `maintenance`, or `lost` status grouped by category, enabling quick resolution.

| Parameter  | Location | Type   | Required | Description                      |
| ---------- | -------- | ------ | -------- | -------------------------------- |
| locationId | path     | string | Yes      | MongoDB ObjectId of the location |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "inventoryIssues": {
      "damaged": [
        {
          "instanceId": "665...",
          "serialNumber": "SN-001",
          "materialTypeName": "Projector HD",
          "status": "damaged",
          "updatedAt": "2024-06-01T08:00:00Z"
        }
      ],
      "maintenance": [],
      "lost": []
    }
  }
}
```

---

#### GET /locations/:locationId/operations/transfers

Returns the transfer queue for the location: inbound transfers (where the location is the destination) that are in transit or picking, plus pending transfer requests.

| Parameter  | Location | Type   | Required | Description                      |
| ---------- | -------- | ------ | -------- | -------------------------------- |
| locationId | path     | string | Yes      | MongoDB ObjectId of the location |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "transferQueue": {
      "inboundInTransit": [
        {
          "transferId": "665...",
          "fromLocationName": "Main Warehouse",
          "status": "in_transit",
          "itemCount": 5,
          "createdAt": "2024-06-01T09:00:00Z"
        }
      ],
      "pendingRequests": [
        {
          "requestId": "665...",
          "fromLocationName": "Branch A",
          "toLocationName": "This Location",
          "status": "requested",
          "itemCount": 2,
          "createdAt": "2024-05-31T15:00:00Z"
        }
      ]
    }
  }
}
```

---

#### GET /locations/:locationId/operations/loans/deadlines

Returns loans with approaching or overdue deadlines for the location, enabling proactive customer follow-up.

| Parameter  | Location | Type   | Required | Description                      |
| ---------- | -------- | ------ | -------- | -------------------------------- |
| locationId | path     | string | Yes      | MongoDB ObjectId of the location |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "loanDeadlines": {
      "overdue": [
        {
          "loanId": "664...",
          "customerId": "663...",
          "customerName": "John Doe",
          "expectedReturnDate": "2024-05-28T00:00:00Z",
          "daysOverdue": 4,
          "itemCount": 2,
          "status": "overdue"
        }
      ],
      "dueSoon": [
        {
          "loanId": "664...",
          "customerId": "663...",
          "customerName": "Jane Smith",
          "expectedReturnDate": "2024-06-03T00:00:00Z",
          "hoursRemaining": 36,
          "itemCount": 1,
          "status": "active"
        }
      ]
    }
  }
}
```

---

#### GET /locations/:locationId/operations/damages

Returns the damage resolution queue: items with damage reported during inspections, categorized into pending assessment, pending repair, and pending billing.

| Parameter  | Location | Type   | Required | Description                      |
| ---------- | -------- | ------ | -------- | -------------------------------- |
| locationId | path     | string | Yes      | MongoDB ObjectId of the location |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "damageQueue": {
      "pendingAssessment": [
        {
          "inspectionId": "665...",
          "loanId": "664...",
          "instanceId": "665...",
          "serialNumber": "SN-002",
          "materialTypeName": "Speaker System",
          "conditionAfter": "damaged",
          "damageDescription": "Cracked housing",
          "estimatedRepairCost": 150,
          "chargeToCustomer": 100,
          "inspectionStatus": "pending"
        }
      ],
      "pendingRepair": [],
      "pendingBilling": []
    }
  }
}
```

---

#### GET /locations/:locationId/operations/tasks

Aggregated TO-DO list that calls all other operations endpoints via `Promise.all` and produces a unified, prioritized task list for the location operator. Each task has a `priority` (critical/high/medium/low), `category`, `title`, `count`, and `detail` for quick scanning.

| Parameter  | Location | Type   | Required | Description                      |
| ---------- | -------- | ------ | -------- | -------------------------------- |
| locationId | path     | string | Yes      | MongoDB ObjectId of the location |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "tasks": [
      {
        "priority": "critical",
        "category": "financials",
        "title": "Overdue invoices requiring follow-up",
        "count": 2,
        "detail": "Total overdue: $2500.00"
      },
      {
        "priority": "high",
        "category": "loans",
        "title": "Overdue loans past expected return date",
        "count": 3,
        "detail": "Loans past their return deadline"
      },
      {
        "priority": "high",
        "category": "inspections",
        "title": "Pending inspections awaiting review",
        "count": 5,
        "detail": "Items returned and waiting for inspection"
      },
      {
        "priority": "medium",
        "category": "inventory",
        "title": "Damaged inventory items",
        "count": 4,
        "detail": "Items needing repair or write-off"
      },
      {
        "priority": "low",
        "category": "loans",
        "title": "Loans due within 48 hours",
        "count": 2,
        "detail": "Approaching return deadlines"
      }
    ]
  }
}
```

---

### Background Jobs

The server runs several scheduled background jobs that maintain data integrity and send notifications. These jobs run automatically and do not expose HTTP endpoints.

#### Overdue Loan Detection

- **Interval:** Every 5 minutes
- **Behavior:** Finds all loans with `status: "active"` whose `endDate` is in the past. Transitions each to `status: "overdue"`. For each newly overdue loan, sends an email notification (`sendOverdueLoanNotification`) to the user who created the original request, including the loan ID, customer name, end date, and days overdue.

#### Stale Request Expiration

- **Interval:** Every 5 minutes
- **Behavior:** Finds all loan requests with `status: "approved"` or `"deposit_pending"` whose `depositDueDate` is in the past. Transitions each to `status: "expired"`. For each expired request, sends an email notification (`sendRequestExpiredNotification`) to the user who created the request, including the request ID, customer name, and deposit due date.

#### Deposit Refund Reminders

- **Interval:** Every 4 hours
- **Behavior:** Finds loans with `deposit.status: "refund_pending"` that were returned more than 48 hours ago. Sends a reminder email (`sendDepositRefundReminder`) to the user who checked out the loan, including the loan ID, customer name, deposit amount, and days pending. Throttled: will not send a reminder to the same loan more than once every 48 hours (tracked via `lastRefundReminderSentAt`).

---

## 5. Code Samples

### JavaScript (Fetch API with Credentials)

```javascript
// Configuration - cookies are handled automatically with credentials: 'include'
const API_BASE = "https://api.test.local/api/v1";

// Login
async function login(email, password) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // Important: enables HttpOnly cookies
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return response.json();
}

// Get current user
async function getCurrentUser() {
  const response = await fetch(`${API_BASE}/auth/me`, {
    credentials: "include",
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Try to refresh token
      await refreshToken();
      return getCurrentUser();
    }
    throw new Error("Failed to get user");
  }

  return response.json();
}

// Refresh token
async function refreshToken() {
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    // Redirect to login
    window.location.href = "/login";
    throw new Error("Session expired");
  }

  return response.json();
}

// Check payment status (owner only)
async function checkPaymentStatus() {
  const response = await fetch(`${API_BASE}/auth/payment-status`, {
    credentials: "include",
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("Only owners can check payment status");
    }
    throw new Error("Failed to check payment status");
  }

  return response.json();
}

// Accept an invite (set password from invite link)
async function acceptInvite(email, token, password) {
  const response = await fetch(`${API_BASE}/auth/accept-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, token, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return response.json();
}

// Get document types
async function getDocumentTypes() {
  const response = await fetch(`${API_BASE}/customers/document-types`, {
    credentials: "include",
  });

  if (!response.ok) throw new Error("Failed to fetch document types");
  return response.json();
}

// List customers with pagination
async function listCustomers(page = 1, limit = 20, search = "") {
  const params = new URLSearchParams({ page, limit });
  if (search) params.append("search", search);

  const response = await fetch(`${API_BASE}/customers?${params}`, {
    credentials: "include",
  });

  if (!response.ok) throw new Error("Failed to fetch customers");
  return response.json();
}

// Create a customer
async function createCustomer(customerData) {
  const response = await fetch(`${API_BASE}/customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(customerData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to create customer");
  }

  return data;
}

// Usage example
async function main() {
  try {
    // Login
    await login("john@example.com", "password123");

    // Get user info
    const {
      data: { user },
    } = await getCurrentUser();
    console.log(`Logged in as ${user.email} (${user.role})`);

    // Check payment status (if owner)
    if (user.role === "owner") {
      const { data: paymentStatus } = await checkPaymentStatus();
      console.log(`Subscription active: ${paymentStatus.isActive}`);
      console.log(`Current plan: ${paymentStatus.plan}`);
    }

    // Get available document types
    const { data: docTypes } = await getDocumentTypes();
    console.log("Available document types:", docTypes.documentTypes);

    // Create a customer
    const newCustomer = await createCustomer({
      name: { firstName: "Jane", firstSurname: "Doe" },
      email: "jane@example.com",
      phone: "+15551234567",
      documentType: "cc",
      documentNumber: "123456789",
    });

    console.log("Created customer:", newCustomer.data.customer);

    // List customers
    const {
      data: { customers, total },
    } = await listCustomers(1, 10);
    console.log(`Found ${total} customers`);
  } catch (error) {
    console.error("Error:", error.message);
  }
}
```

### JavaScript API Client Class

```javascript
class AlquiEventAPI {
  constructor(baseUrl = "https://api.test.local/api/v1") {
    this.baseUrl = baseUrl;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    };

    if (options.body && typeof options.body === "object") {
      config.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401 && !endpoint.includes("/auth/")) {
        // Try refresh
        await this.refresh();
        return this.request(endpoint, options);
      }

      const error = new Error(data.message || "Request failed");
      error.code = data.code;
      error.status = response.status;
      error.details = data.details;
      throw error;
    }

    return data;
  }

  // Auth
  login(email, password) {
    return this.request("/auth/login", {
      method: "POST",
      body: { email, password },
    });
  }

  logout() {
    return this.request("/auth/logout", { method: "POST" });
  }

  refresh() {
    return this.request("/auth/refresh", { method: "POST" });
  }

  me() {
    return this.request("/auth/me");
  }

  paymentStatus() {
    return this.request("/auth/payment-status");
  }

  acceptInvite(email, token, password) {
    return this.request("/auth/accept-invite", {
      method: "POST",
      body: { email, token, password },
    });
  }

  // Customers
  getDocumentTypes() {
    return this.request("/customers/document-types");
  }

  listCustomers(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/customers?${query}`);
  }

  getCustomer(id) {
    return this.request(`/customers/${id}`);
  }

  createCustomer(data) {
    return this.request("/customers", { method: "POST", body: data });
  }

  updateCustomer(id, data) {
    return this.request(`/customers/${id}`, { method: "PATCH", body: data });
  }

  // Materials
  listMaterialTypes(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/materials/types?${query}`);
  }

  listMaterialInstances(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/materials/instances?${query}`);
  }

  updateInstanceStatus(id, status, notes) {
    return this.request(`/materials/instances/${id}/status`, {
      method: "PATCH",
      body: { status, notes },
    });
  }

  // Loans
  listLoans(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/loans?${query}`);
  }

  getOverdueLoans() {
    return this.request("/loans/overdue");
  }

  // Subscription Types (Super Admin)
  listSubscriptionTypes() {
    return this.request("/subscription-types");
  }

  createSubscriptionType(data) {
    return this.request("/subscription-types", {
      method: "POST",
      body: data,
    });
  }

  calculatePlanCost(plan, seatCount) {
    return this.request(`/subscription-types/${plan}/calculate-cost`, {
      method: "POST",
      body: { seatCount },
    });
  }
}

// Usage
const api = new AlquiEventAPI();

async function example() {
  await api.login("admin@example.com", "password");

  const { data } = await api.listCustomers({ page: 1, limit: 10 });
  console.log(data.customers);

  // Check payment status (for owners)
  try {
    const { data: paymentStatus } = await api.paymentStatus();
    console.log(`Subscription active: ${paymentStatus.isActive}`);
    console.log(`Plan: ${paymentStatus.plan}`);
  } catch (error) {
    if (error.status === 403) {
      console.log("Payment status only available for owners");
    }
  }

  // Calculate subscription cost
  const cost = await api.calculatePlanCost("professional", 10);
  console.log(`Total monthly cost: $${cost.data.totalCost}`);
}
```

---

## 6. Rate Limiting and Usage Guidelines

### Rate Limits by Endpoint Type

| Endpoint Type          | Limit         | Window   | Key           |
| ---------------------- | ------------- | -------- | ------------- |
| **General API**        | 100 requests  | 1 minute | User ID or IP |
| **Authentication**     | 5 requests    | 1 minute | IP address    |
| **Password Reset**     | 3 requests    | 1 hour   | IP address    |
| **Payment Operations** | 10 requests   | 1 minute | User ID       |
| **Webhooks**           | 1000 requests | 1 minute | IP address    |

### Rate Limit Headers

All responses include rate limit information:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 45
```

| Header                  | Description                          |
| ----------------------- | ------------------------------------ |
| `X-RateLimit-Limit`     | Maximum requests allowed in window   |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset`     | Seconds until window resets          |

### Request Correlation IDs

Every response includes an `X-Request-Id` header containing a unique correlation ID for that request. You can provide your own correlation ID by sending the `X-Request-Id` header in the request; otherwise one is generated automatically (UUID v4).

```http
X-Request-Id: 550e8400-e29b-41d4-a716-446655440000
```

Use this ID when reporting issues or debugging — it is logged on the server alongside the request details.

### Rate Limit Exceeded Response

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 45
Content-Type: application/json

{
  "status": "error",
  "message": "Too many requests. Please try again later.",
  "code": "RATE_LIMIT_EXCEEDED",
  "details": {
    "retryAfter": 45,
    "limit": 100,
    "windowMs": 60000
  }
}
```

### Best Practices

1. **Implement exponential backoff** when receiving 429 responses
2. **Cache responses** when possible to reduce API calls
3. **Use pagination** with reasonable page sizes (20-50 items)
4. **Batch operations** when the API supports it
5. **Monitor rate limit headers** to avoid hitting limits

---

## 7. Versioning and Deprecation Policy

### Current Version

**API Version:** v1  
**Base URL:** `/api/v1`

### Versioning Strategy

- API versions are included in the URL path (`/api/v1`, `/api/v2`)
- Major version changes indicate breaking changes
- Minor updates and bug fixes are applied to the current version without version bumps

### Deprecation Policy

1. **Announcement Period:** 6 months minimum notice before deprecation
2. **Sunset Headers:** Deprecated endpoints include `Sunset` header with deprecation date
3. **Documentation:** Deprecated features are marked in documentation
4. **Migration Guides:** Provided for moving to new versions

### Deprecated Endpoint Response Headers

```http
Sunset: Sat, 01 Jun 2027 00:00:00 GMT
Deprecation: true
Link: <https://docs.LendEvent.com/migration/v1-to-v2>; rel="successor-version"
```

### Backward Compatibility Guarantees

Within a major version:

- Existing fields will not be removed or renamed
- Existing endpoints will continue to work
- New optional fields may be added to responses
- New optional parameters may be added to requests

### Breaking Changes (Require New Version)

- Removing or renaming fields
- Changing field data types
- Removing endpoints
- Changing authentication mechanism
- Modifying error response structure

---

## Support

For API support, contact:

- **Documentation:** https://docs.LendEvent.com
- **Status Page:** https://status.LendEvent.com
- **Email:** api-support@LendEvent.com

---

_This documentation was generated for LendEvent API v1.0.0_

---

## Pricing Configurations

Base path: `/api/v1/pricing`

All endpoints require authentication (`authenticate` middleware) and an active organization (`requireActiveOrganization`).

---

### GET /pricing/configs

**Permission:** `pricing:read`

Returns all pricing configurations for the organization.

**Response 200:**
`json
{
  "status": "success",
  "data": [
    {
      "_id": "...",
      "organizationId": "...",
      "scope": "organization",
      "referenceId": "...",
      "strategyType": "per_day",
      "isActive": true,
      "perDayParams": { "overridePricePerDay": null },
      "weeklyMonthlyParams": null,
      "fixedParams": null
    }
  ]
}
`

---

### POST /pricing/configs

**Permission:** `pricing:manage`

Creates a new pricing configuration. Only one config per (organizationId, scope, referenceId) combination is allowed.

**Request Body:**
`json
{
  "scope": "materialType",
  "referenceId": "<materialTypeId>",
  "strategyType": "weekly_monthly",
  "weeklyMonthlyParams": {
    "weeklyPrice": 50,
    "weeklyThreshold": 7,
    "monthlyPrice": 150,
    "monthlyThreshold": 30
  }
}
`

**Response 201:**
`json
{
  "status": "success",
  "data": { ... }
}
`

**Errors:**

- `400` � Missing required params for chosen strategy (e.g. `fixed` without `flatPrice`).
- `409` � A config already exists for this (scope, referenceId) combination.

---

### GET /pricing/configs/:id

**Permission:** `pricing:read`

Returns a single pricing configuration by ID.

**Errors:**

- `404` � Config not found or belongs to a different organization.

---

### PUT /pricing/configs/:id

**Permission:** `pricing:manage`

Updates an existing pricing configuration. `scope` and `referenceId` cannot be changed.

**Request Body:** Same fields as POST but all optional.

**Errors:**

- `404` � Config not found.
- `409` � Update would create a duplicate (scope, referenceId).

---

### DELETE /pricing/configs/:id

**Permission:** `pricing:manage`

Deletes a pricing configuration.

**Errors:**

- `400` � Cannot delete the organization-level default config.
- `404` � Config not found.

---

### POST /pricing/preview

**Permission:** `pricing:read`

Calculates and returns the estimated price for a given item without persisting anything.

**Request Body:**
`json
{
  "itemType": "materialType",
  "referenceId": "<materialTypeId>",
  "quantity": 2,
  "durationInDays": 10
}
`

**Response 200:**
`json
{
  "status": "success",
  "data": {
    "strategyType": "per_day",
    "durationInDays": 10,
    "quantity": 2,
    "unitPrice": 25.00,
    "totalPrice": 500.00,
    "effectivePricePerDay": 25.00
  }
}
`

**Errors:**

- `404` � The referenced materialType or package was not found.

---

## Payment Methods

Payment methods are organization-scoped and used for traceability when recording invoice payments. Each organization starts with a default **Efectivo** method, seeded at registration.

**Base URL:** `/api/v1/payment-methods`

All endpoints require authentication and an active organization.

---

### GET /payment-methods

Lists all **active** payment methods for the authenticated organization.

**Permissions:** `payment_methods:read`

**Response `200`:**

```json
{
  "status": "success",
  "data": {
    "paymentMethods": [
      {
        "id": "664abc123def456789012345",
        "name": "Efectivo",
        "description": "Pago en efectivo / Cash payment",
        "status": "active",
        "isDefault": true,
        "createdAt": "2024-01-15T10:00:00.000Z",
        "updatedAt": "2024-01-15T10:00:00.000Z"
      }
    ]
  }
}
```

---

### POST /payment-methods

Creates a new payment method for the organization.

**Permissions:** `payment_methods:create`

**Request body:**

| Field       | Type   | Required | Description                          |
| ----------- | ------ | -------- | ------------------------------------ |
| name        | string | Yes      | Unique name (max 100 chars)          |
| description | string | No       | Optional description (max 300 chars) |
| status      | string | No       | `"active"` (default) or `"inactive"` |

**Response `201`:**

```json
{
  "status": "success",
  "data": {
    "paymentMethod": {
      "id": "664abc123def456789012346",
      "name": "Transferencia Bancaria",
      "description": "Pago mediante transferencia bancaria",
      "status": "active",
      "isDefault": false
    }
  }
}
```

**Errors:**

- `409` -- A payment method with that name already exists in this organization.

---

### PATCH /payment-methods/:id

Updates an existing payment method. The `name` of default (seeded) methods cannot be changed.

**Permissions:** `payment_methods:update`

**URL params:** `id` -- ObjectId of the payment method.

**Request body** (all fields optional):

| Field       | Type   | Description                                      |
| ----------- | ------ | ------------------------------------------------ |
| name        | string | New name (cannot change name of default methods) |
| description | string | Updated description                              |
| status      | string | `"active"` or `"inactive"`                       |

**Errors:**

- `400` -- Attempt to rename a default payment method.
- `404` -- Payment method not found.
- `409` -- Name already taken in this organization.

---

### DELETE /payment-methods/:id

Deactivates a payment method (soft delete -- sets status to `"inactive"`).

**Permissions:** `payment_methods:delete`

**URL params:** `id` -- ObjectId of the payment method.

**Response `200`:**

```json
{
  "status": "success",
  "data": { "id": "664abc123def456789012346", "status": "inactive" }
}
```

**Errors:**

- `400` -- Payment method is already inactive.
- `404` -- Payment method not found.

---

## Maintenance Batches

Base path: `/api/v1/maintenance`

All endpoints require `authenticate` + active organization middleware.

### GET /maintenance

Lists maintenance batches for the organization with pagination and optional filters.

**Permissions:** `maintenance:read`

**Query params:**

| Param      | Type   | Required | Description                      |
| ---------- | ------ | -------- | -------------------------------- |
| page       | number | No       | Page number (default 1)          |
| limit      | number | No       | Items per page (default 20)      |
| status     | string | No       | Filter by batch status           |
| assignedTo | string | No       | Filter by assigned user ObjectId |

**Response `200`:**

```json
{
  "status": "success",
  "data": {
    "batches": [
      {
        "_id": "...",
        "name": "March Repairs",
        "status": "draft",
        "items": [],
        "totalEstimatedCost": 0,
        "totalActualCost": 0,
        "createdAt": "2026-03-10T...",
        "updatedAt": "2026-03-10T..."
      }
    ],
    "pagination": { "total": 1, "page": 1, "limit": 20, "pages": 1 }
  }
}
```

---

### POST /maintenance

Creates a new maintenance batch in `draft` status.

**Permissions:** `maintenance:create`

**Request body:**

| Field              | Type   | Required | Description                     |
| ------------------ | ------ | -------- | ------------------------------- |
| name               | string | Yes      | Batch name (max 200)            |
| description        | string | No       | Description (max 1000)          |
| scheduledStartDate | string | No       | ISO date                        |
| scheduledEndDate   | string | No       | ISO date                        |
| assignedTo         | string | No       | ObjectId of assigned technician |
| locationId         | string | No       | ObjectId of repair location     |
| notes              | string | No       | Additional notes (max 1000)     |

**Response `201`:**

```json
{
  "status": "success",
  "data": {
    "_id": "...",
    "name": "March Repairs",
    "status": "draft",
    "items": [],
    "organizationId": "...",
    "createdBy": "..."
  }
}
```

---

### GET /maintenance/:id

Gets a single maintenance batch with populated references.

**Permissions:** `maintenance:read`

**URL params:** `id` -- ObjectId of the batch.

**Response `200`:**

```json
{
  "status": "success",
  "data": {
    "_id": "...",
    "name": "March Repairs",
    "status": "in_progress",
    "items": [
      {
        "_id": "...",
        "materialInstanceId": { "_id": "...", "serialNumber": "SN-001" },
        "entryReason": "damaged",
        "itemStatus": "in_repair",
        "sourceType": "inspection",
        "sourceId": "..."
      }
    ],
    "assignedTo": { "_id": "...", "email": "tech@example.com" },
    "totalEstimatedCost": 150,
    "totalActualCost": 0
  }
}
```

**Errors:**

- `404` -- Batch not found.

---

### PATCH /maintenance/:id

Updates batch metadata. Only allowed while batch is in `draft` status.

**Permissions:** `maintenance:update`

**Request body:** Same fields as POST (all optional).

**Errors:**

- `404` -- Batch not found.
- `409` -- Batch is not in draft status.

---

### POST /maintenance/:id/start

Starts a maintenance batch (`draft` → `in_progress`). Transitions all pending items to `in_repair` and syncs material instance statuses to `maintenance`.

**Permissions:** `maintenance:update`

**URL params:** `id` -- ObjectId of the batch.

**Errors:**

- `404` -- Batch not found.
- `409` -- Batch has no items, or invalid status transition.

---

### POST /maintenance/:id/cancel

Cancels a batch from `draft` or `in_progress`. For active batches, reverts `in_repair` items back to `damaged` status.

**Permissions:** `maintenance:update`

**URL params:** `id` -- ObjectId of the batch.

**Errors:**

- `404` -- Batch not found.
- `409` -- Invalid status transition (e.g., already completed).

---

### POST /maintenance/:id/items

Adds items to a `draft` maintenance batch.

**Permissions:** `maintenance:update`

**Request body:**

| Field | Type  | Required | Description           |
| ----- | ----- | -------- | --------------------- |
| items | array | Yes      | Array of item objects |

Each item:

| Field              | Type   | Required | Description                                   |
| ------------------ | ------ | -------- | --------------------------------------------- |
| materialInstanceId | string | Yes      | ObjectId of the material instance             |
| entryReason        | string | Yes      | `"damaged"`, `"lost"`, or `"other"`           |
| sourceType         | string | Yes      | `"inspection"`, `"incident"`, or `"manual"`   |
| sourceId           | string | No       | ObjectId of the source inspection or incident |
| sourceItemIndex    | number | No       | Index of the item in the source document      |
| estimatedCost      | number | No       | Estimated repair cost                         |
| repairNotes        | string | No       | Notes about the item (max 500)                |

**Errors:**

- `404` -- Batch or material instance not found.
- `409` -- Batch not in draft, or instance already in an active batch.

---

### DELETE /maintenance/:id/items/:instanceId

Removes an item from a `draft` batch.

**Permissions:** `maintenance:update`

**URL params:**

- `id` -- ObjectId of the batch.
- `instanceId` -- ObjectId of the material instance to remove.

**Errors:**

- `404` -- Batch or item not found.
- `409` -- Batch not in draft status.

---

### PATCH /maintenance/:id/items/:instanceId

Resolves a single item as `repaired` or `unrecoverable`. Syncs the material instance status accordingly (`available` or `retired`). If all items are resolved, auto-completes the batch.

**Permissions:** `maintenance:resolve`

**URL params:**

- `id` -- ObjectId of the batch.
- `instanceId` -- ObjectId of the material instance.

**Request body:**

| Field       | Type   | Required | Description                       |
| ----------- | ------ | -------- | --------------------------------- |
| resolution  | string | Yes      | `"repaired"` or `"unrecoverable"` |
| actualCost  | number | No       | Actual repair cost                |
| repairNotes | string | No       | Resolution notes (max 500)        |

**Response `200`:**

```json
{
  "status": "success",
  "data": {
    "_id": "...",
    "status": "in_progress",
    "items": [
      {
        "materialInstanceId": "...",
        "itemStatus": "repaired",
        "resolvedAt": "2026-03-12T...",
        "actualCost": 85
      }
    ]
  }
}
```

**Errors:**

- `404` -- Batch or item not found.
- `409` -- Batch not in `in_progress`, or item not in `in_repair` status.

---

## Code Schemes

Base path: `/api/v1/code-schemes`

All endpoints require `authenticate` + active organization middleware.

Code schemes define patterns used to auto-generate human-readable codes for multiple entities: Loans, Loan Requests, Invoices, Inspections, Incidents, Maintenance Batches, and Material Instances (e.g. `LO-2026-0001`, `INV-2026-0012`, `MI-000042`).

### Supported Entity Types

| Entity Type         | Default Pattern       | Auto-generated Field                        |
| ------------------- | --------------------- | ------------------------------------------- |
| `loan`              | `LO-{YYYY}-{SEQ:4}`   | `code`                                      |
| `loan_request`      | `REQ-{YYYY}-{SEQ:4}`  | `code`                                      |
| `invoice`           | `INV-{YYYY}-{SEQ:4}`  | `invoiceNumber`                             |
| `inspection`        | `INSP-{YYYY}-{SEQ:4}` | `inspectionNumber`                          |
| `incident`          | `INC-{YYYY}-{SEQ:4}`  | `incidentNumber`                            |
| `maintenance_batch` | `MNT-{YYYY}-{SEQ:4}`  | `batchNumber`                               |
| `material_instance` | `MI-{SEQ:6}`          | `serialNumber` (fallback when not provided) |

### Supported Pattern Tokens

| Token             | Description                | Example Output   | Entity Restriction  |
| ----------------- | -------------------------- | ---------------- | ------------------- |
| `{SEQ}`           | Unpadded sequential number | 1, 2, 42         | All                 |
| `{SEQ:N}`         | Zero-padded to N digits    | `{SEQ:4}` → 0001 | All                 |
| `{YYYY}`          | 4-digit year               | 2026             | All                 |
| `{YY}`            | 2-digit year               | 26               | All                 |
| `{MM}`            | 2-digit month (01-12)      | 04               | All                 |
| `{DD}`            | 2-digit day (01-31)        | 06               | All                 |
| `{LOCATION_CODE}` | Location code value        | ABC              | All                 |
| `{TYPE_CODE}`     | Material type code         | EQP              | `material_instance` |
| `{CATEGORY_CODE}` | Material category code     | AUD              | `material_instance` |

Every pattern must contain exactly one `{SEQ}` or `{SEQ:N}` token.

### Material Instance Scope Resolution

`material_instance` schemes support scoping by `materialTypeId` or `categoryId`. When generating a serial number, the system resolves the scheme using a priority chain:

1. **Type-scoped** — scheme with matching `materialTypeId` (highest priority)
2. **Category-scoped** — scheme with matching `categoryId` of the material type
3. **Global** — scheme with `materialTypeId: null` and `categoryId: null` (org-wide default)
4. **Fallback** — hardcoded pattern `MI-{SEQ:6}` if no scheme exists

### GET /code-schemes

Lists all code schemes for the organization.

**Permission:** `code_schemes:read`

**Query parameters:**

| Param        | Type   | Description                                                       |
| ------------ | ------ | ----------------------------------------------------------------- |
| `entityType` | string | Optional filter by entity type (see supported entity types above) |

**Response (200):**

```json
{
  "status": "success",
  "data": {
    "schemes": [
      {
        "_id": "...",
        "organizationId": "...",
        "entityType": "loan",
        "name": "Predeterminado Préstamo",
        "pattern": "LO-{YYYY}-{SEQ:4}",
        "isActive": true,
        "isDefault": true,
        "materialTypeId": null,
        "categoryId": null,
        "createdAt": "...",
        "updatedAt": "..."
      }
    ]
  }
}
```

### GET /code-schemes/:id

Gets a single code scheme.

**Permission:** `code_schemes:read`

**Response (200):**

```json
{
  "status": "success",
  "data": {
    "scheme": { ... }
  }
}
```

**Errors:**

- `404` — Scheme not found.

### POST /code-schemes

Creates a new code scheme.

**Permission:** `code_schemes:create`

**Request body:**

| Field            | Type           | Required | Description                                           |
| ---------------- | -------------- | -------- | ----------------------------------------------------- |
| `entityType`     | string         | Yes      | Target entity type                                    |
| `name`           | string (1-100) | Yes      | Display name                                          |
| `pattern`        | string (1-50)  | Yes      | Code pattern with tokens                              |
| `isActive`       | boolean        | No       | Default `true`                                        |
| `isDefault`      | boolean        | No       | Default `false`                                       |
| `materialTypeId` | ObjectId       | No       | Scope to material type (only for `material_instance`) |
| `categoryId`     | ObjectId       | No       | Scope to category (only for `material_instance`)      |

> **Note:** `materialTypeId` and `categoryId` are mutually exclusive — you cannot set both. They are only valid when `entityType` is `"material_instance"`.

**Example requests:**

```json
{
  "entityType": "loan",
  "name": "Préstamo por Ubicación",
  "pattern": "LO-{LOCATION_CODE}-{YYYY}{MM}-{SEQ:4}",
  "isDefault": false
}
```

```json
{
  "entityType": "material_instance",
  "name": "Equipos Electrónicos",
  "pattern": "{TYPE_CODE}-{SEQ:5}",
  "materialTypeId": "665012ab...",
  "isDefault": true
}
```

**Response (201):**

```json
{
  "status": "success",
  "data": {
    "scheme": { ... }
  }
}
```

**Errors:**

- `400` — Invalid pattern (no `{SEQ}`, unknown token, too long, `{TYPE_CODE}`/`{CATEGORY_CODE}` on non-material_instance type).
- `400` — `materialTypeId`/`categoryId` set on non-material_instance entity, or both set simultaneously.
- `409` — Duplicate name for this entity type and scope.

### PUT /code-schemes/:id

Updates an existing code scheme. Cannot change `entityType`, `materialTypeId`, or `categoryId`.

**Permission:** `code_schemes:update`

**Request body:**

| Field      | Type           | Required | Description              |
| ---------- | -------------- | -------- | ------------------------ |
| `name`     | string (1-100) | No       | Display name             |
| `pattern`  | string (1-50)  | No       | Code pattern with tokens |
| `isActive` | boolean        | No       | Active flag              |

**Response (200):**

```json
{
  "status": "success",
  "data": {
    "scheme": { ... }
  }
}
```

**Errors:**

- `400` — Invalid pattern or restricted tokens for entity type.
- `404` — Scheme not found.

### DELETE /code-schemes/:id

Deletes a code scheme. Cannot delete the default scheme.

**Permission:** `code_schemes:delete`

**Response (200):**

```json
{
  "status": "success",
  "data": null
}
```

**Errors:**

- `400` — Cannot delete the default scheme.
- `404` — Scheme not found.

### PATCH /code-schemes/:id/set-default

Sets a code scheme as the default for its entity type and scope. For `material_instance` schemes, the default is scoped by `materialTypeId`/`categoryId` — setting a type-scoped scheme as default only affects other type-scoped schemes with the same type. The previous default (if any) in the same scope is automatically unset.

**Permission:** `code_schemes:update`

**Response (200):**

```json
{
  "status": "success",
  "data": {
    "scheme": { ... }
  }
}
```

**Errors:**

- `400` — Cannot set an inactive scheme as default.
- `404` — Scheme not found.
