# LendEvent API Documentation

**Version:** 1.0.0  
**Base URL:** `https://api.test.local/api/v1`  
**Last Updated:** February 2026

---

## Table of Contents

1. [Introduction and Overview](#1-introduction-and-overview)
2. [Getting Started Guide](#2-getting-started-guide)
3. [Authentication and Authorization](#3-authentication-and-authorization)

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

### Authentication Flow

```
┌─────────────┐     POST /auth/login       ┌─────────────┐
│   Client    │ ────────────────────────▶ │    API      │
│             │◀──────────────────────────│             │
└─────────────┘   Set-Cookie: access_token └─────────────┘
                  Set-Cookie: refresh_token

┌─────────────┐    GET /any-endpoint       ┌─────────────┐
│   Client    │ ──────────────────────────▶│    API      │
│             │   Cookie: access_token     │             │
└─────────────┘                            └─────────────┘
```

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

The server reads the `refresh_token` cookie and issues new tokens automatically.

### Logout

```bash
POST /api/v1/auth/logout
```

Clears both authentication cookies.

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

Authenticates user and sets JWT cookies.

| Parameter | Location | Type   | Required | Description   |
| --------- | -------- | ------ | -------- | ------------- |
| email     | body     | string | Yes      | User email    |
| password  | body     | string | Yes      | User password |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "...",
      "email": "...",
      "name": { ... },
      "roleId": "...",
      "roleName": "...",
      "locations": ["..."],
      "permissions": ["organization:read", "users:create", "users:read"]
    },
    "permissions": ["organization:read", "users:create", "users:read"]
  }
}
```

---

#### POST /auth/refresh

Refreshes access token using refresh token cookie.

**Request:** No body required. `refresh_token` cookie must be present.

**Response:** `200 OK`

```json
{
  "status": "success",
  "message": "Tokens refreshed"
}
```

---

#### POST /auth/logout

Clears authentication cookies.

**Response:** `200 OK`

```json
{
  "status": "success",
  "message": "Logged out successfully"
}
```

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

| Role                 | Type     | Read-only | Notes                                 |
| -------------------- | -------- | --------- | ------------------------------------- |
| `owner`              | `SYSTEM` | Yes       | Cannot be renamed, edited, or deleted |
| `manager`            | `CUSTOM` | No        | Editable default role                 |
| `warehouse_operator` | `CUSTOM` | No        | Editable default role                 |
| `commercial_advisor` | `CUSTOM` | No        | Editable default role                 |

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
        "name": "owner",
        "permissions": ["organization:read", "users:create"],
        "description": "Organization owner — full access. System role, non-editable and non-deletable.",
        "isReadOnly": true,
        "type": "SYSTEM"
      },
      {
        "_id": "507f1f77bcf86cd799439013",
        "name": "manager",
        "permissions": ["materials:read", "requests:approve"],
        "description": "Default manager role — can be customized by the owner.",
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
      "name": "owner",
      "permissions": ["organization:read", "users:create"],
      "description": "Organization owner — full access. System role, non-editable and non-deletable.",
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

**Notes:**

- The name `super_admin` is reserved and will be rejected.
- Permissions belonging to the platform `super_admin` role are restricted and cannot be assigned to organization roles.
- Use `GET /permissions` to retrieve the full list of valid, assignable permission identifiers.

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

**Notes:**

- System roles (`isReadOnly: true`) cannot be modified. Attempting to do so returns `403 Forbidden`.

**Error Responses:**

| Status | Condition                                  | Message                                                               |
| ------ | ------------------------------------------ | --------------------------------------------------------------------- |
| 403    | Role is a system role (`isReadOnly: true`) | `The 'owner' role is a system role and cannot be modified or deleted` |
| 404    | Role not found in organization             | `Role not found`                                                      |
| 409    | Name already taken in organization         | `Role with that name already exists`                                  |

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

The permissions endpoint exposes all active, organization-assignable permissions from the database. It is intended for UI role editors so users can build a labelled, categorised permission picker without hard-coding permission strings on the client.

**Super-admin-only permissions are excluded** — only permissions that can legally be assigned to an organization role are returned.

#### GET /permissions

Returns all active permissions that can be assigned to organization roles, sorted by category then identifier.

**Authentication Required:** Yes

**Active Organization Required:** Yes

**Permission Required:** `permissions:read`

**Filters applied server-side:**

- `isPlatformPermission: false` — excludes super-admin-only capabilities (e.g. `platform:manage`, `subscription_types:*`)
- `isActive: true` — excludes soft-disabled permissions

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "permissions": [
      {
        "_id": "customers:create",
        "displayName": "Create Customers",
        "description": "Allows creating new customer records",
        "category": "Customers"
      },
      {
        "_id": "materials:read",
        "displayName": "Read Materials",
        "description": "Allows viewing material types and instances",
        "category": "Materials"
      },
      {
        "_id": "roles:read",
        "displayName": "Read Roles",
        "description": "Allows listing and viewing organization roles",
        "category": "Roles"
      }
    ]
  }
}
```

**Response fields per permission object:**

| Field         | Type   | Description                                             |
| ------------- | ------ | ------------------------------------------------------- |
| `_id`         | string | Permission identifier in `resource:action` format       |
| `displayName` | string | Human-readable label for UI display                     |
| `description` | string | Short description of what granting this permission does |
| `category`    | string | Grouping category (e.g. `Materials`, `Roles`, `Users`)  |

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

| Parameter  | Location | Type    | Required | Description                                |
| ---------- | -------- | ------- | -------- | ------------------------------------------ |
| plan       | body     | string  | Yes      | `starter`, `professional`, or `enterprise` |
| seatCount  | body     | integer | No       | Number of seats (default: 1)               |
| successUrl | body     | string  | Yes      | URL to redirect on success                 |
| cancelUrl  | body     | string  | Yes      | URL to redirect on cancel                  |

**Permission Required:** Owner only

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "checkoutUrl": "https://checkout.stripe.com/pay/..."
  }
}
```

---

#### POST /billing/portal

Creates a Stripe Billing Portal session.

| Parameter | Location | Type   | Required | Description                   |
| --------- | -------- | ------ | -------- | ----------------------------- |
| returnUrl | body     | string | Yes      | URL to return to after portal |

---

#### PATCH /billing/seats

Updates the subscription seat quantity.

| Parameter | Location | Type    | Required | Description    |
| --------- | -------- | ------- | -------- | -------------- |
| seatCount | body     | integer | Yes      | New seat count |

---

#### POST /billing/cancel

Cancels the subscription.

| Parameter         | Location | Type    | Required | Description                                  |
| ----------------- | -------- | ------- | -------- | -------------------------------------------- |
| cancelImmediately | body     | boolean | No       | Cancel now or at period end (default: false) |

---

#### GET /billing/history

Gets billing history for the organization.

| Parameter | Location | Type    | Required | Description             |
| --------- | -------- | ------- | -------- | ----------------------- |
| limit     | query    | integer | No       | Max items (default: 50) |

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

Gets a specific customer.

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

---

#### PATCH /customers/:id

Updates a customer's information.

**Permission Required:** `customers:update`

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

**Error Response:** `400 Bad Request` (if customer has active loans)

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

- **400 Bad Request** – Validation errors (missing required fields, invalid format)
- **409 Conflict** – Location with the same name already exists in the organization

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

#### Example Request

```json
{
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

- **400 Bad Request** – Invalid location ID or validation errors
- **404 Not Found** – Location does not exist

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

Lists all material categories.

**Permission Required:** `materials:read`

---

#### POST /materials/categories

Creates a new category.

**Permission Required:** `materials:create`

| Parameter   | Location | Type   | Required | Description   |
| ----------- | -------- | ------ | -------- | ------------- |
| name        | body     | string | Yes      | Category name |
| description | body     | string | Yes      | Description   |

---

#### DELETE /materials/categories/:id

Deletes a material category. Fails if any material types reference this category.

**Permission Required:** `materials:delete`

---

#### GET /materials/types

Lists all material types (catalog items).

**Permission Required:** `materials:read`

| Parameter  | Location | Type    | Required | Description                   |
| ---------- | -------- | ------- | -------- | ----------------------------- |
| page       | query    | integer | No       | Page number (default: 1)      |
| limit      | query    | integer | No       | Items per page (default: 20)  |
| categoryId | query    | string  | No       | Filter by category            |
| search     | query    | string  | No       | Search by name or description |

**Success Response (200):**

```json
{
  "status": "success",
  "data": {
    "materialTypes": [
      {
        "_id": "60d5f49f1c7d2e001f8e4b1a",
        "name": "Tripod",
        "description": "Standard tripod",
        "categoryId": {
          "_id": "60d5f48f1c7d2e001f8e4b19",
          "name": "Accessories"
        },
        "pricePerDay": 1500,
        "attributes": []
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

---

#### POST /materials/types

Creates a new material type. Validates against organization's catalog item limit.

**Permission Required:** `materials:create`

| Parameter   | Location | Type   | Required | Description          |
| ----------- | -------- | ------ | -------- | -------------------- |
| name        | body     | string | Yes      | Material name        |
| description | body     | string | Yes      | Description          |
| categoryId  | body     | string | Yes      | Category ID          |
| pricePerDay | body     | number | Yes      | Rental price per day |

---

#### PATCH /materials/types/:id

Updates a material type. All fields are optional.

**Permission Required:** `materials:update`

| Parameter   | Location | Type   | Required | Description          |
| ----------- | -------- | ------ | -------- | -------------------- |
| name        | body     | string | No       | Material name        |
| description | body     | string | No       | Description          |
| categoryId  | body     | string | No       | Category ID          |
| pricePerDay | body     | number | No       | Rental price per day |

---

#### DELETE /materials/types/:id

Deletes a material type. Fails if any material instances of this type exist.

**Permission Required:** `materials:delete`

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

| Parameter | Location | Type    | Required | Description                                                   |
| --------- | -------- | ------- | -------- | ------------------------------------------------------------- |
| status    | query    | string  | No       | Filter by `requested`, `approved`, `rejected`, or `fulfilled` |
| fulfilled | query    | boolean | No       | If `true`, includes fulfilled requests. Default: `false`.     |

**Permission Required:** `transfers:read`

---

#### PATCH /transfers/requests/:id/respond

Approves or rejects a transfer request.

| Parameter | Location | Type   | Required | Description                          |
| --------- | -------- | ------ | -------- | ------------------------------------ |
| status    | body     | string | Yes      | New status: `approved` or `rejected` |

**Permission Required:** `transfers:update`

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

**Permission Required:** `transfers:create`

---

#### PATCH /transfers/:id/receive

Marks a transfer as received at the destination location. Updates the location of all items and sets their status back to `available`. Optionally records the received condition per item.

| Parameter     | Location | Type   | Required | Description                                                                                                                                                                       |
| ------------- | -------- | ------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| receiverNotes | body     | string | No       | Notes from the receiver                                                                                                                                                           |
| items         | body     | array  | No       | List of `{ instanceId, receivedCondition }` to record per-item received condition. `receivedCondition` enum: `OK`, `DAMAGED`, `MISSING_PARTS`, `DIRTY`, `REPAIR_REQUIRED`, `LOST` |

**Permission Required:** `transfers:update`

---

#### GET /transfers

Lists all physical transfers.

**Permission Required:** `transfers:read`

---

#### GET /transfers/:id

Gets detailed information about a specific transfer, including item details.

**Permission Required:** `transfers:read`

---

### Material Attribute Endpoints

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

| Parameter      | Location | Type   | Required | Description                                                                 |
| -------------- | -------- | ------ | -------- | --------------------------------------------------------------------------- |
| customerId     | body     | string | Yes      | Customer ID                                                                 |
| items          | body     | array  | Yes      | Array of request items                                                      |
| startDate      | body     | string | Yes      | Loan start date (ISO 8601)                                                  |
| endDate        | body     | string | Yes      | Loan end date (ISO 8601). Must be after `startDate`.                        |
| depositDueDate | body     | string | Yes      | Date by which deposit must be paid (ISO 8601). Cannot be after `startDate`. |
| notes          | body     | string | No       | Additional notes                                                            |

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

Approves a loan request (manager action).

| Parameter | Location | Type   | Required | Description    |
| --------- | -------- | ------ | -------- | -------------- |
| notes     | body     | string | No       | Approval notes |

---

#### POST /requests/:id/reject

Rejects a loan request.

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
- `409 CONFLICT`: request not in `approved` status or one/more instances unavailable

Legacy compatibility remains available through:

- `POST /requests/:id/assign`
- `POST /requests/:id/ready`

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

Gets a specific loan with full details.

---

#### POST /loans/from-request/:requestId

Creates a loan from a ready request (pickup / checkout action).

**Auth:** `authenticate` + `requireActiveOrganization` + `loans:create`

**Preconditions (enforced server-side):**

1. The request must be in `ready` status.
2. If `depositAmount > 0`, the deposit must have been recorded as paid (`depositPaidAt` is set). Use `POST /requests/:id/record-payment` to record manual payments first.

On success:

- A new `Loan` is created with `status: "active"`.
- The source request transitions to `status: "shipped"` and its `loanId` field is populated with the new loan's ID.
- All assigned material instances are marked as `loaned`.

**Errors:**

| Code              | Condition                                         |
| ----------------- | ------------------------------------------------- |
| `400 BAD_REQUEST` | Deposit has not been paid and `depositAmount > 0` |
| `404 NOT_FOUND`   | Request not found or not in `ready` status        |

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

Creates an inspection for a returned loan. If damages or lost items are reported with a cost, a "damage" invoice is automatically generated for the customer.

| Parameter                | Location | Type     | Required | Description                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | -------- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| loanId                   | body     | string   | Yes      | ID of the loan being inspected (must be in `returned` status)                                                                                                                                                                                                                                                                                               |
| overallNotes             | body     | string   | No       | General notes about the inspection                                                                                                                                                                                                                                                                                                                          |
| items                    | body     | object[] | Yes      | Array of inspected items                                                                                                                                                                                                                                                                                                                                    |
| items.materialInstanceId | body     | string   | Yes      | ID of the material instance                                                                                                                                                                                                                                                                                                                                 |
| items.condition          | body     | string   | Yes      | `good`, `damaged`, `lost`                                                                                                                                                                                                                                                                                                                                   |
| items.notes              | body     | string   | No       | Notes for this specific item                                                                                                                                                                                                                                                                                                                                |
| items.damageDescription  | body     | string   | No       | Description of the damage                                                                                                                                                                                                                                                                                                                                   |
| items.damageCost         | body     | number   | No       | Cost in cents to be charged to the customer (e.g., 150000 = $1,500.00 COP)                                                                                                                                                                                                                                                                                  |
| dueDate                  | body     | string   | No       | Optional ISO datetime for the damage invoice due date. Only allowed when one or more items are `damaged` or `lost` and a damage invoice will be generated. If provided it will be set as the invoice `dueDate`; otherwise the server defaults to 30 days from creation. Supplying `dueDate` when no invoice will be generated results in `400 Bad Request`. |

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

Marks a loan as returned.

---

### Inspection Endpoints

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

#### POST /invoices/:id/payment

Records a payment against an invoice.

| Parameter       | Location | Type   | Required | Description       |
| --------------- | -------- | ------ | -------- | ----------------- |
| amount          | body     | number | Yes      | Payment amount    |
| paymentMethodId | body     | string | Yes      | Payment method ID |
| reference       | body     | string | No       | Payment reference |

---

#### POST /invoices/:id/void

Voids an invoice.

| Parameter | Location | Type   | Required | Description |
| --------- | -------- | ------ | -------- | ----------- |
| reason    | body     | string | Yes      | Void reason |

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
