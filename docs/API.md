# API Documentation

## Overview

This API provides a multi-tenant material rental/loan management system with organization-based access control, billing integration via Stripe, and comprehensive inventory lifecycle management.

**Base URL:** `http://localhost:8080/api/v1`

**Authentication:** JWT tokens stored in HTTP-only cookies. All protected routes require the `accessToken` cookie.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Users](#users)
3. [Organizations](#organizations)
4. [Billing](#billing)
5. [Customers](#customers)
6. [Materials](#materials)
7. [Packages](#packages)
8. [Requests](#requests)
9. [Loans](#loans)
10. [Inspections](#inspections)
11. [Invoices](#invoices)
12. [RBAC Roles & Permissions](#rbac-roles--permissions)
13. [Error Responses](#error-responses)

---

## Authentication

### Register Organization & Owner

Creates a new organization and registers the owner user.

```
POST /auth/register
```

**Request Body:**

```json
{
  "organization": {
    "name": "EventPro Rentals",
    "legalName": "EventPro Rentals LLC",
    "email": "contact@eventpro.com",
    "phone": "+1234567890",
    "taxId": "123-456-789",
    "address": {
      "street": "123 Main St",
      "city": "New York",
      "country": "USA",
      "postalCode": "10001"
    }
  },
  "owner": {
    "email": "owner@eventpro.com",
    "password": "SecurePassword123!",
    "phone": "+1987654321",
    "name": {
      "firstName": "John",
      "secondName": "D.",
      "firstSurname": "Doe",
      "secondSurname": "Smith"
    }
  }
}
```

**Response:** `201 Created`

```json
{
  "status": "success",
  "data": {
    "organization": {
      "id": "60d0fe4f5311236168a109ca",
      "name": "EventPro Rentals",
      "email": "contact@eventpro.com"
    },
    "user": {
      "id": "60d0fe4f5311236168a109cb",
      "email": "owner@eventpro.com",
      "name": {
        "firstName": "John",
        "secondName": "D.",
        "firstSurname": "Doe",
        "secondSurname": "Smith"
      },
      "role": "owner"
    }
  }
}
```

**Cookies Set:**

- `access_token` (HTTP-only, 15min expiry)
- `refresh_token` (HTTP-only, 7 days expiry)

---

### Login

Authenticates a user and sets HTTP-only cookies.

```
POST /auth/login
```

**Request Body:**

```json
{
  "email": "owner@eventpro.com",
  "password": "SecurePassword123!"
}
```

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "60d0fe4f5311236168a109cb",
      "email": "owner@eventpro.com",
      "name": {
        "firstName": "John",
        "secondName": "D.",
        "firstSurname": "Doe",
        "secondSurname": "Smith"
      },
      "role": "owner"
    }
  }
}
```

**Cookies Set:**

- `access_token` (HTTP-only, 15min expiry)
- `refresh_token` (HTTP-only, 7 days expiry)

---

### Refresh Token

Refreshes the access token using the refresh token cookie.

```
POST /auth/refresh
```

**Request Headers:**
Cookie: `refresh_token=...`

**Response:** `200 OK`

```json
{
  "status": "success",
  "message": "Tokens refreshed"
}
```

**Cookies Updated:** `access_token`, `refresh_token`

---

### Logout

Clears authentication cookies.

```
POST /auth/logout
```

**Response:** `200 OK`

```json
{
  "status": "success",
  "message": "Logged out successfully"
}
```

---

### Get Current User

Returns the authenticated user's information.

```
GET /auth/me
```

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "user": {
      "_id": "60d0fe4f5311236168a109cb",
      "organizationId": {
        "_id": "60d0fe4f5311236168a109ca",
        "name": "EventPro Rentals",
        "email": "contact@eventpro.com"
      },
      "name": {
        "firstName": "John",
        "firstSurname": "Doe"
      },
      "email": "owner@eventpro.com",
      "role": "owner",
      "status": "active",
      "createdAt": "2023-01-01T00:00:00.000Z"
    }
  }
}
```

---

### Change Password

```
POST /auth/change-password
```

**Request Body:**

```json
{
  "currentPassword": "oldPassword123",
  "newPassword": "newSecurePassword123!"
}
```

---

## Users

All user routes require authentication and appropriate permissions.

### List Users

```
GET /users
```

**Query Parameters:**

- `page` (number, default: 1)
- `limit` (number, default: 20)
- `role` (string, optional): owner | manager | warehouse_operator | commercial_advisor
- `status` (string, optional): active | inactive | pending

**Required Permission:** `users:read`

---

### Get User

```
GET /users/:id
```

**Required Permission:** `users:read`

---

### Invite User

Creates a new user invitation within the organization.

```
POST /users/invite
```

**Request Body:**

```json
{
  "email": "newuser@company.com",
  "role": "commercial_advisor",
  "profile": {
    "firstName": "Jane",
    "lastName": "Smith"
  }
}
```

**Required Permission:** `users:create`

---

### Update User

```
PATCH /users/:id
```

**Request Body:**

```json
{
  "profile": {
    "firstName": "Updated",
    "phone": "+1987654321"
  }
}
```

**Required Permission:** `users:update`

---

### Update User Role

```
PATCH /users/:id/role
```

**Request Body:**

```json
{
  "role": "manager"
}
```

**Required Permission:** `users:role:update`

---

### Deactivate User

```
POST /users/:id/deactivate
```

**Required Permission:** `users:update`

---

### Reactivate User

```
POST /users/:id/reactivate
```

**Required Permission:** `users:update`

---

### Delete User

```
DELETE /users/:id
```

**Required Permission:** `users:delete`

---

## Organizations

### Get Organization

```
GET /organizations
```

Returns the current user's organization details.

---

### Update Organization

```
PATCH /organizations
```

**Request Body:**

```json
{
  "name": "Updated Company Name",
  "settings": {
    "defaultCurrency": "USD",
    "timezone": "America/New_York"
  }
}
```

**Required Role:** Owner

---

### Get Organization Usage

```
GET /organizations/usage
```

Returns current usage statistics vs plan limits.

**Response:**

```json
{
  "status": "success",
  "data": {
    "usage": {
      "activeSeats": 5,
      "maxSeats": 10,
      "catalogItems": 150,
      "maxCatalogItems": 500,
      "activeLoans": 45,
      "maxActiveLoans": 200
    }
  }
}
```

---

### Get Available Plans

```
GET /organizations/plans
```

Returns available subscription plans and their limits.

---

## Billing

### Create Checkout Session

Creates a Stripe Checkout session for subscription.

```
POST /billing/checkout
```

**Request Body:**

```json
{
  "plan": "professional",
  "seatCount": 5,
  "successUrl": "https://app.example.com/billing/success",
  "cancelUrl": "https://app.example.com/billing/cancel"
}
```

**Response:**

```json
{
  "status": "success",
  "data": {
    "checkoutUrl": "https://checkout.stripe.com/..."
  }
}
```

**Required Role:** Owner

---

### Create Portal Session

Creates a Stripe Billing Portal session.

```
POST /billing/portal
```

**Request Body:**

```json
{
  "returnUrl": "https://app.example.com/settings"
}
```

**Required Role:** Owner

---

### Update Seat Quantity

```
PATCH /billing/seats
```

**Request Body:**

```json
{
  "seatCount": 10
}
```

**Required Role:** Owner

---

### Cancel Subscription

```
POST /billing/cancel
```

**Request Body:**

```json
{
  "cancelImmediately": false
}
```

**Required Role:** Owner

---

### Get Billing History

```
GET /billing/history
```

**Query Parameters:**

- `limit` (number, default: 50)

**Required Role:** Owner

---

### Stripe Webhook

```
POST /billing/webhook
```

Handles Stripe webhook events. Requires raw body and Stripe signature verification.

---

## Customers

### List Customers

```
GET /customers
```

**Query Parameters:**

- `page`, `limit`, `sortBy`, `sortOrder`
- `status`: active | inactive | blacklisted
- `search`: searches email, name, document number

**Required Permission:** `customers:read`

---

### Get Customer

```
GET /customers/:id
```

**Required Permission:** `customers:read`

---

### Create Customer

```
POST /customers
```

**Request Body:**

```json
{
  "email": "customer@example.com",
  "name": {
    "firstName": "Carlos",
    "firstSurname": "García"
  },
  "documentType": "CC",
  "documentNumber": "1234567890",
  "phone": "+573001234567",
  "address": {
    "street": "Calle 123",
    "city": "Bogotá",
    "state": "Cundinamarca",
    "country": "Colombia"
  }
}
```

**Required Permission:** `customers:create`

---

### Update Customer

```
PATCH /customers/:id
```

**Required Permission:** `customers:update`

---

### Blacklist Customer

```
POST /customers/:id/blacklist
```

**Required Permission:** `customers:update`

---

### Delete Customer

```
DELETE /customers/:id
```

**Required Permission:** `customers:delete`

---

## Materials

### Categories

#### List Categories

```
GET /materials/categories
```

#### Create Category

```
POST /materials/categories
```

---

### Material Types (Catalog)

#### List Material Types

```
GET /materials/types
```

**Query Parameters:**

- `page`, `limit`
- `categoryId`
- `search`

---

#### Get Material Type

```
GET /materials/types/:id
```

---

#### Create Material Type

```
POST /materials/types
```

**Request Body:**

```json
{
  "name": "Canon EOS R5",
  "description": "Professional mirrorless camera",
  "categoryId": "...",
  "pricePerDay": 150.0,
  "replacementValue": 3899.0,
  "specifications": {
    "sensor": "45MP Full Frame",
    "video": "8K RAW"
  }
}
```

**Required Permission:** `materials:create`

---

#### Update Material Type

```
PATCH /materials/types/:id
```

**Required Permission:** `materials:update`

---

#### Delete Material Type

```
DELETE /materials/types/:id
```

**Required Permission:** `materials:delete`

---

### Material Instances

#### List Material Instances

```
GET /materials/instances
```

**Query Parameters:**

- `page`, `limit`
- `status`: available | reserved | loaned | returned | maintenance | damaged | lost | retired
- `materialTypeId`
- `search` (serial number)

---

#### Get Material Instance

```
GET /materials/instances/:id
```

---

#### Create Material Instance

```
POST /materials/instances
```

**Request Body:**

```json
{
  "modelId": "...",
  "serialNumber": "CANON-R5-001",
  "acquisitionDate": "2024-01-15",
  "acquisitionCost": 3500.0,
  "condition": "new"
}
```

---

#### Update Material Instance Status

```
PATCH /materials/instances/:id/status
```

**Request Body:**

```json
{
  "status": "maintenance",
  "notes": "Scheduled sensor cleaning"
}
```

**Required Permission:** `materials:state:update`

---

#### Delete Material Instance

```
DELETE /materials/instances/:id
```

**Required Permission:** `materials:delete`

---

## Packages

Packages are predefined groupings of material types for easy rental.

### List Packages

```
GET /packages
```

**Query Parameters:**

- `page`, `limit`
- `isActive`: true | false
- `search`

---

### Get Package

```
GET /packages/:id
```

---

### Create Package

```
POST /packages
```

**Request Body:**

```json
{
  "name": "Professional Photo Kit",
  "description": "Complete setup for professional photography",
  "pricePerDay": 350.0,
  "materialTypes": [
    { "materialTypeId": "...", "quantity": 1 },
    { "materialTypeId": "...", "quantity": 2 }
  ]
}
```

---

### Update Package

```
PATCH /packages/:id
```

---

### Activate Package

```
POST /packages/:id/activate
```

---

### Deactivate Package

```
POST /packages/:id/deactivate
```

---

### Delete Package

```
DELETE /packages/:id
```

---

## Requests

Loan requests follow this workflow: **pending → approved → assigned → ready → completed**

### List Requests

```
GET /requests
```

**Query Parameters:**

- `page`, `limit`, `sortBy`, `sortOrder`
- `status`: pending | approved | assigned | ready | completed | rejected | cancelled | expired
- `customerId`
- `packageId`

---

### Get Request

```
GET /requests/:id
```

---

### Create Request

Commercial Advisor creates a loan request for a customer.

```
POST /requests
```

**Request Body:**

```json
{
  "customerId": "...",
  "packageId": "...",
  "requestedStartDate": "2024-02-01",
  "requestedEndDate": "2024-02-05",
  "deposit": {
    "amount": 500.0,
    "method": "credit_card",
    "status": "pending"
  },
  "notes": "Client prefers morning pickup"
}
```

**Required Permission:** `requests:create`

---

### Approve Request

Manager approves a pending request.

```
POST /requests/:id/approve
```

**Request Body:**

```json
{
  "notes": "Approved for VIP client"
}
```

**Required Permission:** `requests:approve`

---

### Reject Request

Manager rejects a pending request.

```
POST /requests/:id/reject
```

**Request Body:**

```json
{
  "reason": "Customer has outstanding invoices"
}
```

**Required Permission:** `requests:approve`

---

### Assign Materials

Warehouse Operator assigns specific material instances to an approved request.

```
POST /requests/:id/assign
```

**Request Body:**

```json
{
  "assignments": [
    { "materialTypeId": "...", "materialInstanceId": "..." },
    { "materialTypeId": "...", "materialInstanceId": "..." }
  ]
}
```

**Required Permission:** `requests:assign`

---

### Mark Ready

Warehouse Operator marks request as ready for customer pickup.

```
POST /requests/:id/ready
```

**Required Permission:** `requests:assign`

---

### Cancel Request

```
POST /requests/:id/cancel
```

**Required Permission:** `requests:update`

---

## Loans

### List Loans

```
GET /loans
```

**Query Parameters:**

- `page`, `limit`, `sortBy`, `sortOrder`
- `status`: active | overdue | returned | completed | cancelled
- `customerId`
- `overdue`: true | false

---

### Get Overdue Loans

```
GET /loans/overdue
```

Returns all overdue loans and updates status automatically.

---

### Get Loan

```
GET /loans/:id
```

---

### Create Loan from Request

Creates a loan when customer picks up materials from a ready request.

```
POST /loans/from-request/:requestId
```

**Required Permission:** `loans:create`

---

### Extend Loan

```
POST /loans/:id/extend
```

**Request Body:**

```json
{
  "newEndDate": "2024-02-10T18:00:00Z",
  "notes": "Customer requested extension"
}
```

**Required Permission:** `loans:update`

---

### Return Loan

Initiates return process (materials pending inspection).

```
POST /loans/:id/return
```

**Request Body:**

```json
{
  "notes": "All items returned in good condition"
}
```

**Required Permission:** `loans:update`

---

### Complete Loan

Finalizes loan after inspection is done.

```
POST /loans/:id/complete
```

**Required Permission:** `loans:update`

---

## Inspections

### List Inspections

```
GET /inspections
```

**Query Parameters:**

- `page`, `limit`
- `loanId`

---

### Get Inspection

```
GET /inspections/:id
```

---

### Get Pending Loans for Inspection

```
GET /inspections/pending-loans
```

Returns loans that are returned but not yet inspected.

---

### Create Inspection

Warehouse Operator inspects returned materials.

```
POST /inspections
```

**Request Body:**

```json
{
  "loanId": "...",
  "items": [
    {
      "materialInstanceId": "...",
      "condition": "good"
    },
    {
      "materialInstanceId": "...",
      "condition": "damaged",
      "damageDescription": "Scratched lens",
      "damageCost": 250.0
    }
  ],
  "overallNotes": "One item had minor damage"
}
```

**Required Permission:** `inspections:create`

**Note:** If damages are found, an invoice is automatically generated.

---

## Invoices

### List Invoices

```
GET /invoices
```

**Query Parameters:**

- `page`, `limit`, `sortBy`, `sortOrder`
- `status`: pending | partial | paid | voided | refunded
- `type`: rental | damage | late_fee | deposit_deduction | other
- `customerId`
- `loanId`
- `overdue`: true | false

---

### Get Invoice Summary

```
GET /invoices/summary
```

Returns statistics for pending, paid, and overdue invoices.

---

### Get Invoice

```
GET /invoices/:id
```

---

### Create Invoice

```
POST /invoices
```

**Request Body:**

```json
{
  "customerId": "...",
  "type": "rental",
  "items": [
    {
      "description": "Canon EOS R5 rental (5 days)",
      "quantity": 5,
      "unitPrice": 150.0
    }
  ],
  "taxRate": 0.19,
  "dueDate": "2024-02-15T00:00:00Z"
}
```

**Required Permission:** `invoices:create`

---

### Record Payment

```
POST /invoices/:id/pay
```

**Request Body:**

```json
{
  "amount": 500.0,
  "paymentMethodId": "...",
  "reference": "TXN-123456",
  "notes": "Partial payment"
}
```

**Required Permission:** `invoices:update`

---

### Void Invoice

```
POST /invoices/:id/void
```

**Request Body:**

```json
{
  "reason": "Duplicate invoice created in error"
}
```

**Required Permission:** `invoices:delete`

---

### Send Invoice

```
POST /invoices/:id/send
```

Sends invoice notification to customer email.

**Required Permission:** `invoices:update`

---

## RBAC Roles & Permissions

### Roles

| Role                 | Description                         |
| -------------------- | ----------------------------------- |
| `owner`              | Organization owner with full access |
| `manager`            | Can approve requests, manage users  |
| `warehouse_operator` | Handles material logistics          |
| `commercial_advisor` | Customer-facing sales role          |

### Permission Matrix

| Permission               | Owner | Manager | Warehouse | Commercial |
| ------------------------ | ----- | ------- | --------- | ---------- |
| `users:read`             | ✓     | ✓       | ✓         | -          |
| `users:create`           | ✓     | ✓       | -         | -          |
| `users:update`           | ✓     | ✓       | -         | -          |
| `users:delete`           | ✓     | -       | -         | -          |
| `users:role:update`      | ✓     | -       | -         | -          |
| `customers:read`         | ✓     | ✓       | ✓         | ✓          |
| `customers:create`       | ✓     | ✓       | -         | ✓          |
| `customers:update`       | ✓     | ✓       | -         | ✓          |
| `customers:delete`       | ✓     | ✓       | -         | -          |
| `materials:read`         | ✓     | ✓       | ✓         | ✓          |
| `materials:create`       | ✓     | ✓       | ✓         | -          |
| `materials:update`       | ✓     | ✓       | ✓         | -          |
| `materials:delete`       | ✓     | ✓       | -         | -          |
| `materials:state:update` | ✓     | ✓       | ✓         | -          |
| `packages:read`          | ✓     | ✓       | ✓         | ✓          |
| `packages:create`        | ✓     | ✓       | -         | -          |
| `packages:update`        | ✓     | ✓       | -         | -          |
| `packages:delete`        | ✓     | -       | -         | -          |
| `requests:read`          | ✓     | ✓       | ✓         | ✓          |
| `requests:create`        | ✓     | ✓       | -         | ✓          |
| `requests:update`        | ✓     | ✓       | -         | -          |
| `requests:approve`       | ✓     | ✓       | -         | -          |
| `requests:assign`        | ✓     | ✓       | ✓         | -          |
| `loans:read`             | ✓     | ✓       | ✓         | ✓          |
| `loans:create`           | ✓     | ✓       | ✓         | -          |
| `loans:update`           | ✓     | ✓       | ✓         | -          |
| `inspections:read`       | ✓     | ✓       | ✓         | -          |
| `inspections:create`     | ✓     | ✓       | ✓         | -          |
| `invoices:read`          | ✓     | ✓       | -         | ✓          |
| `invoices:create`        | ✓     | ✓       | -         | -          |
| `invoices:update`        | ✓     | ✓       | -         | -          |
| `invoices:delete`        | ✓     | -       | -         | -          |
| `organization:read`      | ✓     | ✓       | ✓         | ✓          |
| `organization:update`    | ✓     | -       | -         | -          |
| `billing:read`           | ✓     | -       | -         | -          |
| `billing:manage`         | ✓     | -       | -         | -          |

---

## Error Responses

All errors follow this format:

```json
{
  "status": "error",
  "message": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": { ... }
}
```

### HTTP Status Codes

| Code | Description                                      |
| ---- | ------------------------------------------------ |
| 400  | Bad Request - Invalid input                      |
| 401  | Unauthorized - Missing or invalid authentication |
| 403  | Forbidden - Insufficient permissions             |
| 404  | Not Found - Resource doesn't exist               |
| 409  | Conflict - Resource already exists               |
| 422  | Unprocessable Entity - Validation failed         |
| 429  | Too Many Requests - Rate limit exceeded          |
| 500  | Internal Server Error                            |

### Common Error Codes

- `VALIDATION_ERROR` - Request body validation failed
- `AUTHENTICATION_REQUIRED` - No valid authentication token
- `PERMISSION_DENIED` - User lacks required permission
- `RESOURCE_NOT_FOUND` - Requested resource doesn't exist
- `DUPLICATE_RESOURCE` - Resource with same identifier exists
- `PLAN_LIMIT_EXCEEDED` - Organization has reached plan limits
- `ORGANIZATION_INACTIVE` - Organization subscription is inactive
- `RATE_LIMIT_EXCEEDED` - Too many requests

---

## Rate Limits

| Endpoint Type      | Limit                      |
| ------------------ | -------------------------- |
| Global             | 100 requests/minute per IP |
| Authentication     | 5 requests/minute per IP   |
| Password Reset     | 3 requests/hour per email  |
| Payment Operations | 10 requests/minute per org |
| Webhooks           | 1000 requests/minute       |

---

## Environment Variables

```bash
# Server
PORT=8080
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/rental_db

# JWT
JWT_ACCESS_SECRET=your-access-secret
JWT_REFRESH_SECRET=your-refresh-secret
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# CORS
CORS_ORIGIN=http://localhost:3000

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PROFESSIONAL_PRICE_ID=price_...
STRIPE_ENTERPRISE_PRICE_ID=price_...
```

---

## Workflow Examples

### Complete Rental Flow

1. **Create Customer** - Commercial Advisor registers new customer
2. **Create Request** - Commercial Advisor creates loan request
3. **Approve Request** - Manager approves the request
4. **Assign Materials** - Warehouse Operator assigns specific items
5. **Mark Ready** - Warehouse Operator marks request ready
6. **Create Loan** - Customer picks up, loan is created
7. **Return Loan** - Customer returns materials
8. **Create Inspection** - Warehouse Operator inspects items
9. **Complete Loan** - Loan is finalized

### Damage Handling

1. During inspection, mark item as `damaged` with cost
2. Invoice is automatically generated
3. Record payment when customer pays
4. Material status updated to `damaged` → `maintenance` → `available`
