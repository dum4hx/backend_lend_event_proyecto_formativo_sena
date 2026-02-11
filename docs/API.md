# API Documentation

## Overview

Multi-tenant material rental and loan management API with organization-based access control, billing via Stripe, and inventory lifecycle tracking.

**Base URL:** `http://localhost:8080/api/v1`

**Authentication:** JWT tokens stored in HTTP-only cookies. Protected routes require the `access_token` cookie.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Users](#users)
3. [Organization](#organization)
4. [Billing](#billing)
5. [Customers](#customers)
6. [Materials](#materials)
7. [Packages](#packages)
8. [Requests](#requests)
9. [Loans](#loans)
10. [Inspections](#inspections)
11. [Invoices](#invoices)
12. [Subscription Types](#subscription-types)
13. [Admin Analytics](#admin-analytics)
14. [RBAC Roles & Permissions](#rbac-roles--permissions)
15. [Error Responses](#error-responses)

---

## Authentication

### Register Organization & Owner

Creates a new organization and owner user.

```
POST /auth/register
```

**Request Body:**

```json
{
  "organization": {
    "name": "Acme Rentals",
    "legalName": "Acme Rentals LLC",
    "email": "billing@company.com",
    "taxId": "900123456-7",
    "phone": "+1234567890",
    "address": {
      "country": "Colombia",
      "city": "Bogota",
      "street": "Calle 123",
      "postalCode": "110111"
    }
  },
  "owner": {
    "name": {
      "firstName": "John",
      "secondName": "",
      "firstSurname": "Doe",
      "secondSurname": ""
    },
    "email": "owner@company.com",
    "phone": "+573001234567",
    "password": "SecurePassword123!"
  }
}
```

**Optional fields:** `organization.taxId`, `organization.phone`, `organization.address`, `organization.address.postalCode`, `owner.name.secondName`, `owner.name.secondSurname`.

**Response:** `201 Created`

```json
{
  "status": "success",
  "data": {
    "organization": {
      "id": "...",
      "name": "Acme Rentals",
      "email": "billing@company.com"
    },
    "user": {
      "id": "...",
      "email": "owner@company.com",
      "name": { "firstName": "John", "firstSurname": "Doe" },
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
      "id": "...",
      "email": "user@company.com",
      "name": { "firstName": "Jane", "firstSurname": "Smith" },
      "role": "manager"
    }
  }
}
```

**Cookies Set:**

- `access_token` (HTTP-only, 15 min expiry)
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
  "data": { "user": { ... } }
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

All user routes require authentication and an active organization.

### List Users

```
GET /users
```

**Query Parameters:**

- `page` (number, default: 1)
- `limit` (number, default: 20)
- `sortBy` (string, optional)
- `sortOrder` (string, optional: asc | desc)
- `role` (string, optional): super_admin | owner | manager | warehouse_operator | commercial_advisor
- `status` (string, optional): active | inactive | invited | suspended
- `search` (string, optional)

**Required Permission:** `users:read`

---

### Get User

```
GET /users/:id
```

**Required Permission:** `users:read`

---

### Invite User

```
POST /users/invite
```

**Request Body:**

```json
{
  "name": {
    "firstName": "Jane",
    "secondName": "",
    "firstSurname": "Smith",
    "secondSurname": ""
  },
  "email": "newuser@company.com",
  "phone": "+573001234567",
  "role": "commercial_advisor"
}
```

**Optional fields:** `name.secondName`, `name.secondSurname`, `role`.

**Required Permission:** `users:create`

---

### Update User

```
PATCH /users/:id
```

**Request Body (all optional):**

```json
{
  "name": {
    "firstName": "Updated",
    "firstSurname": "Name"
  },
  "email": "updated@company.com",
  "phone": "+573001111111",
  "role": "manager"
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

**Required Permission:** `users:update`

---

### Deactivate User

```
POST /users/:id/deactivate
```

**Required Permission:** `users:delete`

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

## Organization

### Get Organization

```
GET /organization
```

Returns the current user's organization details.

---

### Update Organization

```
PATCH /organization
```

**Request Body (all optional):**

```json
{
  "name": "Updated Company Name",
  "legalName": "Updated Company Name LLC",
  "taxId": "900123456-7",
  "email": "billing@company.com",
  "phone": "+573001234567",
  "address": {
    "country": "Colombia",
    "city": "Bogota",
    "street": "Calle 123",
    "postalCode": "110111"
  }
}
```

**Required Permission:** `organization:update`

---

### Get Organization Usage

```
GET /organization/usage
```

**Required Permission:** `organization:read`

---

### Get Available Plans

```
GET /organization/plans
```

Authentication required. No additional permission is enforced.

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

**Optional fields:** `seatCount` (default: 1).

**Response:**

```json
{
  "status": "success",
  "data": { "checkoutUrl": "https://checkout.stripe.com/..." }
}
```

**Required Role:** Owner

---

### Create Portal Session

```
POST /billing/portal
```

**Request Body:**

```json
{ "returnUrl": "https://app.example.com/settings" }
```

**Response:**

```json
{
  "status": "success",
  "data": { "portalUrl": "https://billing.stripe.com/..." }
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
{ "seatCount": 10 }
```

**Required Role:** Owner

---

### Cancel Subscription

```
POST /billing/cancel
```

**Request Body:**

```json
{ "cancelImmediately": false }
```

**Optional fields:** `cancelImmediately` (default: false).

**Required Role:** Owner

---

### Get Billing History

```
GET /billing/history
```

**Query Parameters:**

- `limit` (number, optional, default: 50)

**Required Role:** Owner

---

### Stripe Webhook

```
POST /billing/webhook
```

Requires raw body and `stripe-signature` header.

---

## Customers

### List Customers

```
GET /customers
```

**Query Parameters:**

- `page`, `limit`, `sortBy`, `sortOrder`
- `status` (optional): active | inactive | blacklisted
- `search` (optional): matches email, name, document number

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
    "secondName": "",
    "firstSurname": "Garcia",
    "secondSurname": ""
  },
  "phone": "+573001234567",
  "documentType": "cc",
  "documentNumber": "1234567890",
  "address": {
    "country": "Colombia",
    "city": "Bogota",
    "street": "Calle 123",
    "postalCode": "110111",
    "additionalInfo": "Apartment 301"
  },
  "notes": "VIP customer"
}
```

**Optional fields:** `name.secondName`, `name.secondSurname`, `documentType`, `documentNumber`, `address`, `address.postalCode`, `address.additionalInfo`, `notes`.

**Required Permission:** `customers:create`

---

### Update Customer

```
PATCH /customers/:id
```

**Request Body:** any customer fields (all optional).

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

Soft delete by setting status to inactive.

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

**Request Body:**

```json
{
  "name": "Cameras",
  "description": "All camera equipment"
}
```

---

### Material Types (Catalog)

#### List Material Types

```
GET /materials/types
```

**Query Parameters:**

- `page`, `limit`
- `categoryId` (optional)
- `search` (optional)

#### Get Material Type

```
GET /materials/types/:id
```

#### Create Material Type

```
POST /materials/types
```

**Request Body:**

```json
{
  "categoryId": "...",
  "name": "Canon EOS R5",
  "description": "Professional mirrorless camera",
  "pricePerDay": 150.0
}
```

**Required Permission:** `materials:create`

#### Update Material Type

```
PATCH /materials/types/:id
```

**Request Body:** any material type fields (all optional).

**Required Permission:** `materials:update`

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
- `status` (optional): available | reserved | loaned | returned | maintenance | damaged | lost | retired
- `materialTypeId` (optional)
- `search` (optional, serial number)

#### Get Material Instance

```
GET /materials/instances/:id
```

#### Create Material Instance

```
POST /materials/instances
```

**Request Body:**

```json
{
  "modelId": "...",
  "serialNumber": "CANON-R5-001",
  "status": "available",
  "locationId": "..."
}
```

**Optional fields:** `status` (default: available). Allowed values: available | in_use | maintenance | damaged | retired.

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

**Optional fields:** `notes`.

**Required Permission:** `materials:state:update`

#### Delete Material Instance

```
DELETE /materials/instances/:id
```

Only allowed when instance status is `available` or `retired`.

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
- `isActive` (optional): true | false
- `search` (optional)

### Get Package

```
GET /packages/:id
```

### Create Package

```
POST /packages
```

**Request Body:**

```json
{
  "name": "Professional Photo Kit",
  "description": "Complete setup for professional photography",
  "items": [
    { "materialTypeId": "...", "quantity": 1 },
    { "materialTypeId": "...", "quantity": 2 }
  ],
  "pricePerDay": 350.0,
  "discountRate": 0.1,
  "depositAmount": 500.0
}
```

**Optional fields:** `description`, `discountRate` (default: 0), `depositAmount` (default: 0).

### Update Package

```
PATCH /packages/:id
```

**Request Body:** any package fields (all optional).

### Activate Package

```
POST /packages/:id/activate
```

### Deactivate Package

```
POST /packages/:id/deactivate
```

### Delete Package

```
DELETE /packages/:id
```

---

## Requests

Loan requests follow this workflow: **pending → approved → deposit_pending → assigned → ready → expired / rejected / cancelled**

### List Requests

```
GET /requests
```

**Query Parameters:**

- `page`, `limit`, `sortBy`, `sortOrder`
- `status` (optional): pending | approved | deposit_pending | assigned | ready | expired | rejected | cancelled
- `customerId` (optional)
- `packageId` (optional)

### Get Request

```
GET /requests/:id
```

### Create Request

```
POST /requests
```

**Request Body:**

```json
{
  "customerId": "...",
  "items": [{ "type": "package", "referenceId": "...", "quantity": 1 }],
  "startDate": "2024-02-01",
  "endDate": "2024-02-05",
  "notes": "Client prefers morning pickup"
}
```

**Optional fields:** `notes`.

**Required Permission:** `requests:create`

---

### Approve Request

```
POST /requests/:id/approve
```

**Request Body:**

```json
{ "notes": "Approved for VIP client" }
```

**Optional fields:** `notes`.

**Required Permission:** `requests:approve`

---

### Reject Request

```
POST /requests/:id/reject
```

**Request Body:**

```json
{ "reason": "Customer has outstanding invoices" }
```

**Required Permission:** `requests:approve`

---

### Assign Materials

```
POST /requests/:id/assign
```

**Request Body:**

```json
{
  "assignments": [{ "materialTypeId": "...", "materialInstanceId": "..." }]
}
```

**Required Permission:** `requests:assign`

---

### Mark Ready

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
- `status` (optional): active | returned | inspected | closed | overdue
- `customerId` (optional)
- `overdue` (optional): true | false

### Get Overdue Loans

```
GET /loans/overdue
```

Returns all overdue loans and updates status automatically.

### Get Loan

```
GET /loans/:id
```

### Create Loan from Request

```
POST /loans/from-request/:requestId
```

**Required Permission:** `loans:create`

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

**Optional fields:** `notes`.

**Required Permission:** `loans:update`

### Return Loan

```
POST /loans/:id/return
```

**Request Body:**

```json
{ "notes": "All items returned in good condition" }
```

**Optional fields:** `notes`.

**Required Permission:** `loans:update`

### Complete Loan

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
- `loanId` (optional)

### Get Inspection

```
GET /inspections/:id
```

### Get Pending Loans for Inspection

```
GET /inspections/pending-loans
```

Returns loans that are returned but not yet inspected.

### Create Inspection

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

**Optional fields:** `items[].notes`, `items[].damageDescription`, `items[].damageCost`, `overallNotes`.

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
- `status` (optional): draft | pending | paid | partially_paid | overdue | cancelled | refunded
- `type` (optional): damage | late_fee | deposit_shortfall | additional_service | penalty
- `customerId` (optional)
- `loanId` (optional)
- `overdue` (optional): true | false

### Get Invoice Summary

```
GET /invoices/summary
```

### Get Invoice

```
GET /invoices/:id
```

### Create Invoice

```
POST /invoices
```

**Request Body:**

```json
{
  "customerId": "...",
  "loanId": "...",
  "type": "damage",
  "items": [
    {
      "description": "Scratched lens",
      "quantity": 1,
      "unitPrice": 250.0,
      "materialInstanceId": "..."
    }
  ],
  "taxRate": 0.19,
  "dueDate": "2024-02-15T00:00:00Z",
  "notes": "Customer acknowledged damage"
}
```

**Optional fields:** `loanId`, `items[].materialInstanceId`, `taxRate` (default: 0.19), `dueDate` (default: +30 days), `notes`.

**Required Permission:** `invoices:create`

### Record Payment

```
POST /invoices/:id/pay
```

**Request Body:**

```json
{
  "amount": 500.0,
  "paymentMethodId": "cash",
  "reference": "TXN-123456",
  "notes": "Partial payment"
}
```

**Optional fields:** `reference`, `notes`.

**Required Permission:** `invoices:update`

### Void Invoice

```
POST /invoices/:id/void
```

**Request Body:**

```json
{ "reason": "Duplicate invoice created in error" }
```

**Required Permission:** `invoices:delete`

### Send Invoice

```
POST /invoices/:id/send
```

**Required Permission:** `invoices:update`

---

## Subscription Types

### List Active Subscription Types (Public)

```
GET /subscription-types
```

### Get Subscription Type by Plan (Public)

```
GET /subscription-types/:plan
```

### Calculate Plan Cost (Public)

```
POST /subscription-types/:plan/calculate-cost
```

**Request Body:**

```json
{ "seatCount": 5 }
```

### List All Subscription Types (Super Admin)

```
GET /subscription-types/admin/all
```

### Create Subscription Type (Super Admin)

```
POST /subscription-types
```

### Update Subscription Type (Super Admin)

```
PATCH /subscription-types/:plan
```

### Deactivate Subscription Type (Super Admin)

```
DELETE /subscription-types/:plan
```

---

## Admin Analytics

All admin analytics routes require the `super_admin` role.

```
GET /admin/analytics/overview
GET /admin/analytics/organizations
GET /admin/analytics/users
GET /admin/analytics/revenue
GET /admin/analytics/subscriptions
GET /admin/analytics/health
GET /admin/analytics/activity
GET /admin/analytics/dashboard
```

**Optional query parameters:** `periodMonths` (number) for organizations/users/revenue. `limit` (number) for activity.

---

## RBAC Roles & Permissions

### Roles

| Role                 | Description                               |
| -------------------- | ----------------------------------------- |
| `super_admin`        | Platform owner with full access           |
| `owner`              | Organization owner with full access       |
| `manager`            | Approves requests, manages catalog        |
| `warehouse_operator` | Handles material logistics and inspection |
| `commercial_advisor` | Customer-facing sales role                |

### Permissions by Role

**super_admin**

- subscription_types:create, subscription_types:read, subscription_types:update, subscription_types:delete
- platform:manage
- All owner permissions

**owner**

- organization:read, organization:update, organization:delete
- billing:manage, subscription:manage
- users:create, users:read, users:update, users:delete
- customers:create, customers:read, customers:update, customers:delete
- materials:create, materials:read, materials:update, materials:delete, materials:state:update
- packages:create, packages:read, packages:update, packages:delete
- requests:create, requests:read, requests:update, requests:approve, requests:delete
- loans:create, loans:read, loans:update, loans:checkout, loans:return
- inspections:create, inspections:read, inspections:update
- invoices:create, invoices:read, invoices:update
- reports:read, analytics:read

**manager**

- organization:read
- users:read
- customers:read
- materials:create, materials:read, materials:update, materials:delete
- packages:create, packages:read, packages:update, packages:delete
- requests:read, requests:approve
- loans:read
- inspections:read
- invoices:read
- reports:read, analytics:read

**warehouse_operator**

- organization:read
- materials:read, materials:state:update
- packages:read
- loans:read, loans:checkout, loans:return
- inspections:create, inspections:read, inspections:update

**commercial_advisor**

- organization:read
- customers:create, customers:read, customers:update
- materials:read
- packages:read
- requests:create, requests:read, requests:update
- loans:create, loans:read
- invoices:read

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
- `ORGANIZATION_SUSPENDED` - Organization is suspended
- `ORGANIZATION_CANCELLED` - Organization is cancelled
- `RATE_LIMIT_EXCEEDED` - Too many requests

---

## Rate Limits

| Endpoint Type      | Limit                      |
| ------------------ | -------------------------- |
| Global             | 100 requests/minute per IP |
| Authentication     | 5 requests/minute per IP   |
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

1. Create Customer - Commercial Advisor registers new customer
2. Create Request - Commercial Advisor creates loan request
3. Approve Request - Manager approves the request
4. Assign Materials - Warehouse Operator assigns specific items
5. Mark Ready - Warehouse Operator marks request ready
6. Create Loan - Customer picks up, loan is created
7. Return Loan - Customer returns materials
8. Create Inspection - Warehouse Operator inspects items
9. Complete Loan - Loan is finalized

### Damage Handling

1. During inspection, mark item as `damaged` with cost
2. Invoice is automatically generated
3. Record payment when customer pays
4. Material status updated to `damaged` then `maintenance` or `available`
