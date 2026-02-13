# LendEvent API Documentation

**Version:** 1.0.0  
**Base URL:** `https://api.test.local/api/v1`  
**Last Updated:** February 2026

---

## Table of Contents

1. [Introduction and Overview](#1-introduction-and-overview)
2. [Getting Started Guide](#2-getting-started-guide)
3. [Authentication and Authorization](#3-authentication-and-authorization)
4. [Reference Documentation](#4-reference-documentation)
5. [Code Samples](#5-code-samples)
6. [Rate Limiting and Usage Guidelines](#6-rate-limiting-and-usage-guidelines)
7. [Versioning and Deprecation Policy](#7-versioning-and-deprecation-policy)

---

## 1. Introduction and Overview

### What is the LendEvent API?

The LendEvent API is a RESTful service designed for **event rental management businesses**. It provides a comprehensive platform for managing:

- **Organizations & Users** – Multi-tenant architecture with role-based access control
- **Customers** – CRM for rental clients
- **Materials & Packages** – Catalog inventory management with individual item tracking
- **Loan Requests & Approvals** – Complete rental workflow from request to return
- **Invoicing & Billing** – Invoice generation, payment tracking, and Stripe integration
- **Inspections** – Post-return damage assessment and documentation

### Key Capabilities

| Feature                      | Description                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| **Multi-Tenancy**            | Each organization operates in isolation with dedicated data scoping                       |
| **Role-Based Access (RBAC)** | Five roles: `super_admin`, `owner`, `manager`, `warehouse_operator`, `commercial_advisor` |
| **Subscription Management**  | Dynamic subscription types with fixed or per-seat billing models                          |
| **Stripe Integration**       | Secure payment processing with webhook support                                            |
| **Catalog Limits**           | Plan-based limits on catalog items and team seats                                         |

### Response Format

All responses follow a consistent JSON structure:

```json
{
  "status": "success",
  "data": {
    /* resource data */
  },
  "message": "Optional human-readable message"
}
```

Error responses:

```json
{
  "status": "error",
  "message": "Error description",
  "code": "ERROR_CODE",
  "details": {
    /* additional context */
  }
}
```

---

## 2. Getting Started Guide

### Prerequisites

- A registered organization account
- HTTPS client (browser, curl, Postman, or JavaScript Fetch API)
- Cookies must be enabled (authentication uses HttpOnly cookies)

### Quick Start: Your First API Call

#### Step 1: Register an Organization

```bash
curl -X POST https://api.test.local/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "organization": {
      "name": "EventPro Rentals",
      "legalName": "EventPro Rentals LLC",
      "email": "admin@eventpro.com"
    },
    "owner": {
      "name": {
        "firstName": "John",
        "firstSurname": "Doe"
      },
      "email": "john@eventpro.com",
      "password": "SecureP@ss123!",
      "phone": "+15551234567"
    }
  }'
```

**Response (201 Created):**

```json
{
  "status": "success",
  "data": {
    "organization": {
      "id": "507f1f77bcf86cd799439011",
      "name": "EventPro Rentals",
      "email": "admin@eventpro.com"
    },
    "user": {
      "id": "507f1f77bcf86cd799439012",
      "email": "john@eventpro.com",
      "name": { "firstName": "John", "firstSurname": "Doe" },
      "role": "owner"
    }
  }
}
```

The response sets `access_token` and `refresh_token` HttpOnly cookies automatically.

#### Step 2: Make an Authenticated Request

```bash
curl -X GET https://api.test.local/api/v1/auth/me \
  -b cookies.txt
```

**Response (200 OK):**

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439012",
      "email": "john@eventpro.com",
      "name": { "firstName": "John", "firstSurname": "Doe" },
      "role": "owner"
    }
  }
}
```

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
```

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

Registers a new organization with owner account.

| Parameter               | Location | Type   | Required | Description                               |
| ----------------------- | -------- | ------ | -------- | ----------------------------------------- |
| organization.name       | body     | string | Yes      | Organization display name (max 200 chars) |
| organization.legalName  | body     | string | Yes      | Legal business name (max 200 chars)       |
| organization.email      | body     | string | Yes      | Organization email (unique)               |
| organization.taxId      | body     | string | No       | Tax identification number                 |
| organization.phone      | body     | string | No       | Phone in E.164 format                     |
| organization.address    | body     | object | No       | Address object                            |
| owner.name.firstName    | body     | string | Yes      | Owner's first name                        |
| owner.name.firstSurname | body     | string | Yes      | Owner's surname                           |
| owner.email             | body     | string | Yes      | Owner's email (unique)                    |
| owner.password          | body     | string | Yes      | Password (min 8 chars)                    |
| owner.phone             | body     | string | Yes      | Phone in E.164 format                     |

**Response:** `201 Created`

```json
{
  "status": "success",
  "data": {
    "organization": { "id": "...", "name": "...", "email": "..." },
    "user": { "id": "...", "email": "...", "name": {...}, "role": "owner" }
  }
}
```

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
    "user": { "id": "...", "email": "...", "name": {...}, "role": "..." }
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

| Parameter | Location | Type   | Required | Description            |
| --------- | -------- | ------ | -------- | ---------------------- |
| email     | body     | string | Yes      | Registered user email  |

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

| Status | Condition                   | Message                                                 |
| ------ | --------------------------- | ------------------------------------------------------- |
| 400    | No reset request found      | No password reset request found for this email          |
| 400    | Code expired                | Verification code has expired. Please request a new one.|
| 400    | Too many failed attempts    | Too many failed attempts. Please request a new code.    |
| 400    | Wrong code                  | Invalid verification code                               |

**Notes:**

- Maximum 5 verification attempts per code
- After 5 failed attempts, the code is invalidated and a new one must be requested

---

#### POST /auth/reset-password

Resets the user's password using the verified reset token from the previous step.

| Parameter   | Location | Type   | Required | Description                                                         |
| ----------- | -------- | ------ | -------- | ------------------------------------------------------------------- |
| email       | body     | string | Yes      | Email used in previous steps                                        |
| resetToken  | body     | string | Yes      | Token returned by verify-reset-code                                 |
| newPassword | body     | string | Yes      | New password (min 8 chars, uppercase, lowercase, digit, special)    |

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

| Status | Condition               | Message                                                                     |
| ------ | ----------------------- | --------------------------------------------------------------------------- |
| 400    | Invalid/expired token   | Invalid or expired reset token. Please restart the password reset process.  |
| 400    | Token expired           | Reset token has expired. Please request a new code.                         |
| 400    | Password too weak       | Password must be at least 8 characters (and other validation rules)         |

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
      "role": "owner",
      "status": "active"
    }
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
| role      | query    | string  | No       | Filter by role                                                 |
| search    | query    | string  | No       | Search by name or email                                        |

**Permission Required:** `users:read`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "users": [...],
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

Invites a new user to the organization.

| Parameter         | Location | Type   | Required | Description                          |
| ----------------- | -------- | ------ | -------- | ------------------------------------ |
| name.firstName    | body     | string | Yes      | First name (max 50 chars)            |
| name.firstSurname | body     | string | Yes      | Surname (max 50 chars)               |
| email             | body     | string | Yes      | Email address                        |
| phone             | body     | string | Yes      | Phone in E.164 format                |
| role              | body     | string | No       | Role (default: `commercial_advisor`) |

**Permission Required:** `users:create`

**Response:** `201 Created`

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
      "features": ["Unlimited everything", "24/7 support"],
      "status": "active"
    }
  }
}
```

---

#### PATCH /subscription-types/:plan

Updates a subscription type (super admin only).

**Note:** The `plan` field cannot be changed after creation.

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

| Parameter         | Location | Type   | Required | Description                                            |
| ----------------- | -------- | ------ | -------- | ------------------------------------------------------ |
| name.firstName    | body     | string | Yes      | First name                                             |
| name.firstSurname | body     | string | Yes      | Surname                                                |
| email             | body     | string | Yes      | Email address                                          |
| phone             | body     | string | Yes      | Phone in E.164 format                                  |
| documentType      | body     | string | Yes      | `national_id`, `passport`, `drivers_license`, `tax_id` |
| documentNumber    | body     | string | Yes      | Document number                                        |
| address           | body     | object | No       | Address information                                    |

**Permission Required:** `customers:create`

---

#### PATCH /customers/:id

Updates a customer's information.

---

#### POST /customers/:id/blacklist

Blacklists a customer.

---

#### DELETE /customers/:id

Soft deletes a customer (sets status to inactive).

---

### Material Endpoints

#### GET /materials/categories

Lists all material categories.

---

#### POST /materials/categories

Creates a new category.

| Parameter   | Location | Type   | Required | Description        |
| ----------- | -------- | ------ | -------- | ------------------ |
| name        | body     | string | Yes      | Category name      |
| description | body     | string | No       | Description        |
| parentId    | body     | string | No       | Parent category ID |

---

#### GET /materials/types

Lists all material types (catalog items).

| Parameter  | Location | Type   | Required | Description                   |
| ---------- | -------- | ------ | -------- | ----------------------------- |
| categoryId | query    | string | No       | Filter by category            |
| search     | query    | string | No       | Search by name or description |

---

#### POST /materials/types

Creates a new material type. Validates against organization's catalog item limit.

| Parameter       | Location | Type   | Required | Description          |
| --------------- | -------- | ------ | -------- | -------------------- |
| name            | body     | string | Yes      | Material name        |
| description     | body     | string | No       | Description          |
| categoryId      | body     | string | Yes      | Category ID          |
| pricePerDay     | body     | number | Yes      | Rental price per day |
| replacementCost | body     | number | No       | Replacement cost     |

---

#### GET /materials/instances

Lists all material instances.

| Parameter      | Location | Type   | Required | Description                                                                    |
| -------------- | -------- | ------ | -------- | ------------------------------------------------------------------------------ |
| status         | query    | string | No       | `available`, `reserved`, `loaned`, `maintenance`, `damaged`, `lost`, `retired` |
| materialTypeId | query    | string | No       | Filter by material type                                                        |
| search         | query    | string | No       | Search by serial number                                                        |

---

#### POST /materials/instances

Creates a new material instance.

| Parameter    | Location | Type   | Required | Description          |
| ------------ | -------- | ------ | -------- | -------------------- |
| modelId      | body     | string | Yes      | Material type ID     |
| serialNumber | body     | string | Yes      | Unique serial number |
| purchaseDate | body     | string | No       | ISO 8601 date        |
| purchaseCost | body     | number | No       | Purchase cost        |

---

#### PATCH /materials/instances/:id/status

Updates a material instance's status (warehouse operator action).

| Parameter | Location | Type   | Required | Description         |
| --------- | -------- | ------ | -------- | ------------------- |
| status    | body     | string | Yes      | New status          |
| notes     | body     | string | No       | Status change notes |

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

| Parameter     | Location | Type   | Required | Description                                 |
| ------------- | -------- | ------ | -------- | ------------------------------------------- |
| name          | body     | string | Yes      | Package name                                |
| description   | body     | string | No       | Description                                 |
| materialTypes | body     | array  | Yes      | Array of `{ materialTypeId, quantity }`     |
| pricePerDay   | body     | number | No       | Override price (otherwise sum of materials) |

---

### Loan Request Endpoints

#### GET /requests

Lists all loan requests in the organization.

| Parameter  | Location | Type   | Required | Description                                             |
| ---------- | -------- | ------ | -------- | ------------------------------------------------------- |
| status     | query    | string | No       | `pending`, `approved`, `rejected`, `ready`, `cancelled` |
| customerId | query    | string | No       | Filter by customer                                      |
| packageId  | query    | string | No       | Filter by package                                       |

---

#### POST /requests

Creates a new loan request (commercial advisor action).

| Parameter  | Location | Type   | Required | Description                |
| ---------- | -------- | ------ | -------- | -------------------------- |
| customerId | body     | string | Yes      | Customer ID                |
| items      | body     | array  | Yes      | Array of items/packages    |
| startDate  | body     | string | Yes      | Loan start date (ISO 8601) |
| endDate    | body     | string | Yes      | Loan end date (ISO 8601)   |
| notes      | body     | string | No       | Additional notes           |

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

Assigns specific material instances to a request (warehouse operator).

| Parameter   | Location | Type  | Required | Description                                       |
| ----------- | -------- | ----- | -------- | ------------------------------------------------- |
| assignments | body     | array | Yes      | Array of `{ materialTypeId, materialInstanceId }` |

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

Creates a loan from a ready request (pickup action).

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

#### GET /inspections

Lists all inspections.

---

#### GET /inspections/:id

Gets a specific inspection.

---

#### POST /inspections

Creates an inspection for a returned loan (warehouse operator action).

| Parameter                  | Location | Type   | Required | Description               |
| -------------------------- | -------- | ------ | -------- | ------------------------- |
| loanId                     | body     | string | Yes      | Loan ID                   |
| items                      | body     | array  | Yes      | Array of inspection items |
| items[].materialInstanceId | body     | string | Yes      | Material instance ID      |
| items[].condition          | body     | string | Yes      | `good`, `damaged`, `lost` |
| items[].notes              | body     | string | No       | Inspection notes          |
| items[].damageDescription  | body     | string | No       | Damage description        |
| items[].damageCost         | body     | number | No       | Estimated damage cost     |
| overallNotes               | body     | string | No       | General inspection notes  |

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
