# API Reference

Base URL: `https://api.test.local/api/v1`

## Authentication

All authenticated endpoints require the `Authorization` header with a Bearer token, or the access token is automatically sent via HTTP-only cookies after login.

### POST /auth/register

Creates a new organization with an owner account.

**Request Body:**

```json
{
  "organization": {
    "name": "Company Name",
    "legalName": "Company Legal Name S.A.S",
    "email": "company@example.com",
    "phone": "+573001234567",
    "taxId": "900123456-1",
    "address": {
      "street": "Calle 100 #15-20",
      "city": "Bogotá",
      "country": "Colombia",
      "postalCode": "110111"
    }
  },
  "owner": {
    "name": {
      "firstName": "Juan",
      "secondName": "Carlos",
      "firstSurname": "García",
      "secondSurname": "López"
    },
    "email": "juan@example.com",
    "phone": "+573001234567",
    "password": "SecurePassword123!"
  }
}
```

**Response:** `201 Created`

```json
{
  "status": "success",
  "data": {
    "organization": { "id": "...", "name": "..." },
    "user": { "id": "...", "email": "...", "role": "owner" }
  }
}
```

---

### POST /auth/login

Authenticates a user and returns tokens.

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "...",
      "email": "user@example.com",
      "role": "owner",
      "organizationId": "..."
    }
  }
}
```

Tokens are set as HTTP-only cookies: `access_token`, `refresh_token`.

---

### POST /auth/logout

Logs out the current user and clears tokens.

**Response:** `200 OK`

```json
{
  "status": "success",
  "message": "Logged out successfully"
}
```

---

### POST /auth/refresh

Refreshes the access token using the refresh token cookie.

**Response:** `200 OK`

```json
{
  "status": "success",
  "message": "Token refreshed"
}
```

---

### GET /auth/me

Returns the currently authenticated user.

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "...",
      "email": "...",
      "name": { "firstName": "...", "firstSurname": "..." },
      "role": "owner",
      "organizationId": "...",
      "permissions": ["users:read", "users:create", "..."]
    }
  }
}
```

---

## Users

### GET /users

Lists users in your organization.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20, max: 100) |
| `status` | string | Filter: `active`, `inactive`, `invited`, `suspended` |
| `role` | string | Filter: `owner`, `manager`, `warehouse_operator`, `commercial_advisor` |
| `search` | string | Search by name or email |

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

### GET /users/:id

Gets a specific user.

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "...",
      "email": "...",
      "name": { "firstName": "...", "firstSurname": "..." },
      "phone": "...",
      "role": "manager",
      "status": "active",
      "lastLoginAt": "2026-02-01T10:00:00Z"
    }
  }
}
```

---

### POST /users/invite

Invites a new user to your organization.

**Request Body:**

```json
{
  "name": {
    "firstName": "María",
    "firstSurname": "Rodríguez"
  },
  "email": "maria@example.com",
  "phone": "+573009876543",
  "role": "commercial_advisor"
}
```

**Response:** `201 Created`

```json
{
  "status": "success",
  "data": {
    "user": { "id": "...", "email": "...", "status": "invited" }
  },
  "message": "User invited successfully. An invitation email has been sent."
}
```

---

### PATCH /users/:id

Updates a user's profile.

**Request Body:**

```json
{
  "name": { "firstName": "María", "firstSurname": "García" },
  "phone": "+573001112233"
}
```

**Response:** `200 OK`

---

### PATCH /users/:id/role

Changes a user's role.

**Request Body:**

```json
{
  "role": "manager"
}
```

**Response:** `200 OK`

---

### POST /users/:id/deactivate

Deactivates a user account.

**Response:** `200 OK`

---

### POST /users/:id/reactivate

Reactivates a user account.

**Response:** `200 OK`

---

## Customers

### GET /customers

Lists customers in your organization.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number |
| `limit` | number | Items per page |
| `status` | string | `active`, `inactive`, `blacklisted` |
| `search` | string | Search by name, email, or ID number |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "customers": [
      {
        "id": "...",
        "name": { "firstName": "...", "firstSurname": "..." },
        "email": "...",
        "phone": "...",
        "idType": "CC",
        "idNumber": "1234567890",
        "status": "active"
      }
    ],
    "total": 120,
    "page": 1,
    "totalPages": 6
  }
}
```

---

### POST /customers

Creates a new customer.

**Request Body:**

```json
{
  "name": {
    "firstName": "Carlos",
    "firstSurname": "Martínez"
  },
  "email": "carlos@email.com",
  "phone": "+573001234567",
  "idType": "CC",
  "idNumber": "1234567890",
  "address": {
    "street": "Carrera 50 #30-20",
    "city": "Medellín",
    "country": "Colombia"
  }
}
```

**ID Types:** `CC` (Cédula), `CE` (Cédula Extranjería), `NIT`, `PP` (Passport), `TI` (Tarjeta Identidad)

**Response:** `201 Created`

---

### GET /customers/:id

Gets a customer with their loan history summary.

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "customer": { ... },
    "stats": {
      "totalLoans": 5,
      "activeLoans": 1,
      "totalSpent": 500000
    }
  }
}
```

---

### PATCH /customers/:id

Updates customer information.

---

### POST /customers/:id/blacklist

Blacklists a customer (prevents future loans).

**Request Body:**

```json
{
  "reason": "Repeated late returns and unpaid damages"
}
```

---

## Materials

### GET /materials/types

Lists material types (catalog items).

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number |
| `limit` | number | Items per page |
| `categoryId` | string | Filter by category |
| `search` | string | Search by name or SKU |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "materialTypes": [
      {
        "id": "...",
        "name": "Canon EOS R5",
        "sku": "CAM-001",
        "categoryId": "...",
        "description": "Professional mirrorless camera",
        "pricePerDay": 150000,
        "replacementValue": 15000000,
        "availableCount": 3,
        "totalCount": 5
      }
    ],
    "total": 50,
    "page": 1,
    "totalPages": 3
  }
}
```

---

### POST /materials/types

Creates a new material type.

**Request Body:**

```json
{
  "name": "Canon EOS R5",
  "sku": "CAM-001",
  "categoryId": "...",
  "description": "Professional mirrorless camera body",
  "pricePerDay": 150000,
  "replacementValue": 15000000,
  "specifications": {
    "sensor": "45MP Full Frame",
    "video": "8K RAW"
  }
}
```

---

### GET /materials/instances

Lists individual material units.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `materialTypeId` | string | Filter by type |
| `status` | string | `available`, `loaned`, `maintenance`, `damaged`, `retired` |
| `locationId` | string | Filter by storage location |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "instances": [
      {
        "id": "...",
        "serialNumber": "CR5-2024-001",
        "materialTypeId": "...",
        "status": "available",
        "condition": "excellent",
        "locationId": "..."
      }
    ]
  }
}
```

---

### POST /materials/instances

Creates a new material instance.

**Request Body:**

```json
{
  "materialTypeId": "...",
  "serialNumber": "CR5-2024-002",
  "locationId": "...",
  "purchaseDate": "2024-01-15",
  "purchasePrice": 14500000
}
```

---

### PATCH /materials/instances/:id/status

Updates instance status.

**Request Body:**

```json
{
  "status": "maintenance",
  "notes": "Sensor cleaning required"
}
```

---

### GET /materials/categories

Lists material categories.

---

### POST /materials/categories

Creates a category.

**Request Body:**

```json
{
  "name": "Cameras",
  "description": "Photo and video cameras"
}
```

---

## Packages

### GET /packages

Lists rental packages.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number |
| `limit` | number | Items per page |
| `isActive` | boolean | Filter active/inactive packages |
| `search` | string | Search by name |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "packages": [
      {
        "id": "...",
        "name": "Wedding Photography Kit",
        "description": "Complete kit for wedding photography",
        "pricePerDay": 350000,
        "isActive": true,
        "items": [
          { "materialTypeId": "...", "quantity": 2 },
          { "materialTypeId": "...", "quantity": 3 }
        ]
      }
    ]
  }
}
```

---

### POST /packages

Creates a rental package.

**Request Body:**

```json
{
  "name": "Wedding Photography Kit",
  "description": "Complete kit for wedding photography",
  "pricePerDay": 350000,
  "items": [
    { "materialTypeId": "...", "quantity": 2 },
    { "materialTypeId": "...", "quantity": 3 }
  ]
}
```

---

## Loan Requests

### GET /requests

Lists loan requests.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number |
| `limit` | number | Items per page |
| `status` | string | See status values below |
| `customerId` | string | Filter by customer |

**Status Values:** `pending`, `approved`, `deposit_pending`, `assigned`, `ready`, `expired`, `rejected`, `cancelled`

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "requests": [
      {
        "id": "...",
        "customerId": "...",
        "status": "pending",
        "items": [
          { "type": "package", "referenceId": "...", "quantity": 1 },
          { "type": "material", "referenceId": "...", "quantity": 2 }
        ],
        "startDate": "2026-02-10",
        "endDate": "2026-02-12",
        "depositAmount": 500000,
        "totalAmount": 700000,
        "createdAt": "2026-02-01T10:00:00Z"
      }
    ]
  }
}
```

---

### POST /requests

Creates a new loan request.

**Request Body:**

```json
{
  "customerId": "...",
  "items": [
    { "type": "package", "referenceId": "...", "quantity": 1 },
    { "type": "material", "referenceId": "...", "quantity": 2 }
  ],
  "startDate": "2026-02-10",
  "endDate": "2026-02-12",
  "notes": "Customer prefers afternoon pickup"
}
```

---

### GET /requests/:id

Gets request details.

---

### POST /requests/:id/approve

Approves a pending request.

**Request Body:**

```json
{
  "notes": "Approved for loyal customer"
}
```

---

### POST /requests/:id/reject

Rejects a pending request.

**Request Body:**

```json
{
  "reason": "Requested dates unavailable"
}
```

---

### POST /requests/:id/assign-materials

Assigns specific material instances to a request.

**Request Body:**

```json
{
  "assignments": [
    { "materialTypeId": "...", "materialInstanceId": "..." },
    { "materialTypeId": "...", "materialInstanceId": "..." }
  ]
}
```

---

### POST /requests/:id/mark-ready

Marks request as ready for pickup.

---

### POST /requests/:id/cancel

Cancels a request.

**Request Body:**

```json
{
  "reason": "Customer requested cancellation"
}
```

---

## Loans

### GET /loans

Lists active and past loans.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number |
| `limit` | number | Items per page |
| `status` | string | `active`, `returned`, `inspected`, `closed`, `overdue` |
| `customerId` | string | Filter by customer |
| `overdue` | boolean | Show only overdue loans |

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "loans": [
      {
        "id": "...",
        "customerId": "...",
        "requestId": "...",
        "status": "active",
        "startDate": "2026-02-01",
        "endDate": "2026-02-03",
        "depositAmount": 500000,
        "totalAmount": 350000,
        "materialInstances": [
          { "materialInstanceId": "...", "serialNumber": "..." }
        ],
        "checkedOutAt": "2026-02-01T09:00:00Z"
      }
    ]
  }
}
```

---

### GET /loans/overdue

Lists all overdue loans.

---

### GET /loans/:id

Gets loan details.

---

### POST /loans/from-request/:requestId

Creates a loan from a ready request (customer pickup).

**Response:** `201 Created`

```json
{
  "status": "success",
  "data": { "loan": { ... } },
  "message": "Loan created successfully - materials picked up"
}
```

---

### POST /loans/:id/extend

Extends the loan end date.

**Request Body:**

```json
{
  "newEndDate": "2026-02-05T18:00:00Z",
  "notes": "Customer requested 2-day extension"
}
```

---

### POST /loans/:id/return

Initiates return (triggers inspection).

**Request Body:**

```json
{
  "notes": "All items returned, customer mentioned camera was dropped"
}
```

---

### POST /loans/:id/complete

Completes the loan after inspection.

---

## Inspections

### GET /inspections

Lists inspections.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number |
| `limit` | number | Items per page |
| `loanId` | string | Filter by loan |

---

### GET /inspections/pending-loans

Gets loans awaiting inspection.

---

### POST /inspections

Creates an inspection for a returned loan.

**Request Body:**

```json
{
  "loanId": "...",
  "items": [
    {
      "materialInstanceId": "...",
      "condition": "good",
      "notes": "No issues"
    },
    {
      "materialInstanceId": "...",
      "condition": "damaged",
      "damageDescription": "Cracked lens filter",
      "damageCost": 50000
    }
  ],
  "overallNotes": "One item damaged, customer acknowledged"
}
```

**Condition Values:** `good`, `damaged`, `lost`

---

### GET /inspections/:id

Gets inspection details.

---

## Invoices

### GET /invoices

Lists invoices.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number |
| `limit` | number | Items per page |
| `status` | string | `draft`, `pending`, `paid`, `partially_paid`, `overdue`, `cancelled`, `refunded` |
| `type` | string | `damage`, `late_fee`, `deposit_shortfall`, `additional_service`, `penalty` |
| `customerId` | string | Filter by customer |
| `loanId` | string | Filter by loan |
| `overdue` | boolean | Show only overdue invoices |

---

### GET /invoices/:id

Gets invoice details.

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "invoice": {
      "id": "...",
      "invoiceNumber": "INV-2026-001234",
      "customerId": "...",
      "loanId": "...",
      "type": "damage",
      "status": "pending",
      "lineItems": [
        {
          "description": "Damaged lens filter",
          "quantity": 1,
          "unitPrice": 50000,
          "totalPrice": 50000
        }
      ],
      "subtotal": 50000,
      "taxRate": 0.19,
      "taxAmount": 9500,
      "totalAmount": 59500,
      "amountPaid": 0,
      "amountDue": 59500,
      "dueDate": "2026-03-01",
      "createdAt": "2026-02-01T10:00:00Z"
    }
  }
}
```

---

### POST /invoices

Creates an invoice.

**Request Body:**

```json
{
  "customerId": "...",
  "loanId": "...",
  "type": "late_fee",
  "lineItems": [
    {
      "description": "Late return fee - 2 days",
      "quantity": 2,
      "unitPrice": 25000,
      "totalPrice": 50000
    }
  ],
  "dueDate": "2026-03-01",
  "notes": "Late return for loan #12345"
}
```

---

### POST /invoices/:id/pay

Records a payment on an invoice.

**Request Body:**

```json
{
  "amount": 59500,
  "paymentMethodId": "cash",
  "notes": "Paid in full at counter"
}
```

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": { "invoice": { ... } },
  "message": "Invoice fully paid"
}
```

---

### POST /invoices/:id/void

Voids an invoice.

**Request Body:**

```json
{
  "reason": "Duplicate invoice created in error"
}
```

---

### POST /invoices/:id/send

Sends invoice to customer via email.

---

## Billing

### GET /billing/subscription

Gets current subscription status.

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "subscription": {
      "plan": "professional",
      "status": "active",
      "seatCount": 5,
      "catalogItemCount": 120,
      "currentPeriodEnd": "2026-03-01T00:00:00Z"
    },
    "limits": {
      "maxSeats": 10,
      "maxCatalogItems": 500
    },
    "usage": {
      "seatsUsed": 5,
      "catalogItemsUsed": 120
    }
  }
}
```

---

### POST /billing/create-checkout

Creates a Stripe checkout session for subscription upgrade.

**Request Body:**

```json
{
  "plan": "professional"
}
```

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "checkoutUrl": "https://checkout.stripe.com/..."
  }
}
```

---

### POST /billing/create-portal

Creates a Stripe customer portal session for managing subscription.

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "portalUrl": "https://billing.stripe.com/..."
  }
}
```

---

## Organization

### GET /organization

Gets your organization details.

---

### PATCH /organization

Updates organization details.

**Request Body:**

```json
{
  "name": "New Company Name",
  "phone": "+573009999999",
  "address": { ... }
}
```

---

### GET /organization/usage

Gets current plan usage statistics.

**Response:** `200 OK`

```json
{
  "status": "success",
  "data": {
    "seats": { "used": 5, "limit": 10 },
    "catalogItems": { "used": 120, "limit": 500 },
    "plan": "professional"
  }
}
```

---

## Common Response Formats

### Success Response

```json
{
  "status": "success",
  "data": { ... },
  "message": "Optional success message"
}
```

### Error Response

```json
{
  "status": "error",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable error message",
    "details": { ... }
  }
}
```

### Paginated Response

```json
{
  "status": "success",
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "totalPages": 5
  }
}
```

---

## Error Codes

| Code                     | HTTP Status | Description                       |
| ------------------------ | ----------- | --------------------------------- |
| `VALIDATION_ERROR`       | 400         | Invalid request data              |
| `UNAUTHORIZED`           | 401         | Missing or invalid authentication |
| `FORBIDDEN`              | 403         | Insufficient permissions          |
| `NOT_FOUND`              | 404         | Resource not found                |
| `CONFLICT`               | 409         | Resource already exists           |
| `RATE_LIMIT_EXCEEDED`    | 429         | Too many requests                 |
| `PLAN_LIMIT_REACHED`     | 400         | Subscription limit reached        |
| `ORGANIZATION_SUSPENDED` | 401         | Organization is suspended         |
| `INTERNAL_ERROR`         | 500         | Server error                      |

---

## Rate Limits

| Endpoint Type      | Limit               |
| ------------------ | ------------------- |
| General API        | 100 requests/minute |
| Authentication     | 5 requests/minute   |
| Password Reset     | 3 requests/hour     |
| Payment Operations | 10 requests/minute  |

Rate limit headers are included in responses:

- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Seconds until reset

---

## User Roles & Permissions

| Role                 | Description                                    |
| -------------------- | ---------------------------------------------- |
| `owner`              | Full access, billing management                |
| `manager`            | All operations except billing and org settings |
| `warehouse_operator` | Materials, loans, inspections                  |
| `commercial_advisor` | Customers, requests, read-only loans           |
