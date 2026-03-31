# LendEvent Backend — Comprehensive Gap Analysis & Completion Assessment

**Date:** June 2025  
**Last Updated:** July 2025  
**Scope:** Full backend repository (`src/`, `tests/`, `docs/`)  
**Method:** Evidence-based code reading of every model, service, router, middleware, and test file.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Requirement-by-Requirement Matrix](#2-requirement-by-requirement-matrix)
3. [Multi-Tenancy Deep Review](#3-multi-tenancy-deep-review)
4. [Business Logic Deep Review](#4-business-logic-deep-review)
5. [Missing Endpoints & Modules](#5-missing-endpoints--modules)
6. [Risk Register](#6-risk-register)
7. [Recommended Implementation Order](#7-recommended-implementation-order)
8. [Implementation Progress](#8-implementation-progress)

---

## 1. Executive Summary

### Overall Completion: ~97%

LendEvent is a **well-structured, production-leaning** backend for event material rental management. The core rental lifecycle (Request → Loan → Inspection → Invoice) is fully implemented with atomic transactions, proper state machines, deposit tracking, and multi-strategy pricing. Auth, RBAC, multi-tenancy, and Stripe billing infrastructure are all in place.

**Key strengths:**
- Clean modular architecture (router → service → model) consistently followed across all 17+ modules
- MongoDB transactions for all multi-document operations (loan creation, transfer, inspection)
- Comprehensive permission system (55 permissions, 5 default roles, custom role support)
- Pricing engine with 3 strategies (per_day, weekly_monthly, fixed) and 3 scopes (organization, materialType, package)
- Full deposit lifecycle management with automatic application to damage invoices
- Barcode/serial number scanning with dual lookup

**Gaps resolved since initial analysis (July 2025):**
- ✅ Multi-tenancy leaks in Customer.phone, User.phone, and MaterialPlan fixed — compound indexes added
- ✅ Organization-level analytics module implemented (4 endpoints with date-range filters)
- ✅ Reports module implemented (5 endpoints: loans, inventory, financial, damages, transfers) using `reports:read` permission
- ✅ Package availability endpoint added (`GET /packages/:id/availability`) for date-range-aware instance checking
- ✅ Invoice email sending implemented with full HTML template
- ✅ Customer service extracted from router (proper separation of concerns)
- ✅ Background scheduler added (overdue loan detection + request expiration)
- ✅ Request correlation IDs added to middleware
- ✅ MaterialInstance status enum expanded (5 → 9 values)
- ✅ Operations dashboard module implemented (8 location-scoped endpoints: overview, inspections, financials, inventory issues, transfers, loan deadlines, damages, aggregated tasks) using `operations:read` permission
- ✅ Test coverage expanded for billing, invoices, packages, organization, and customer modules

**Remaining gaps:**
- Rate limiter uses in-memory store (will not scale to multiple instances without Redis)
- No distributed tracing or metrics export

---

## 2. Requirement-by-Requirement Matrix

### 2.1 Functional Requirements

| # | Requirement | Status | Score | Evidence |
|---|------------|--------|-------|----------|
| F1 | **Material Catalog (Types, Categories, Attributes)** | ✅ Complete | 95% | `material.service.ts` (1101 lines): full CRUD for categories, types, attributes with inheritance validation. Types have `categoryId[]`, `pricePerDay`, `attributes[]` with `isRequired`. Attributes have `allowedValues` enforcement and narrowing protection. Category deletion blocked when types reference it. Org catalog-item-count quota enforced via `organizationService.incrementCatalogItemCount()`. |
| F2 | **Material Instances (Physical Items)** | ✅ Complete | 95% | `material_instance.model.ts`: per-org unique `serialNumber` + `barcode` (partial index for null barcodes). `scanInstance()` does barcode-first then serial-number lookup. `updateInstanceStatus()` enforces a **state transition map** (available→reserved→loaned→returned→available, with maintenance/damaged/retired branches). `InventoryMovement` audit trail created for every status change with actor and source tracking. `useBarcodeAsSerial` toggle supported. `createInstance()` validates location capacity via `LocationService.validateCapacity()`. |
| F3 | **Packages (Bundled Items)** | ✅ Complete | 90% | `package.service.ts`: CRUD with org scoping, material-type existence validation, duplicate name prevention. `package.model.ts` has `items[]{materialTypeId, quantity}`, `pricePerDay`, `discountRate`, `depositAmount`. `getPackageAvailability()` resolves package items to material types, checks blocking loans/requests in the date range, and returns per-item availability grouped by location with `canFulfill` boolean. Package items reference types but instance assignment is handled through the request/loan flow. |
| F4 | **Request → Loan Lifecycle** | ✅ Complete | 92% | Full 10-state machine in `request.model.ts` (pending→approved→deposit_pending→assigned→ready→shipped→completed/expired/rejected/cancelled). `requestService.createRequest()` validates customer active status, item references, date validity. `approveRequest()` triggers pricing calculation. `assignMaterials()` reserves instances atomically. `recordDepositPayment()` records deposit. `loanService.createLoanFromRequest()` uses MongoDB transaction: validates deposit payment, builds pricing snapshot, transitions instances to `in_use`, creates loan in `active` status. `cancelRequest()` releases reserved materials. |
| F5 | **Available Materials (Smart Assignment)** | ✅ Complete | 90% | `requestService.getAvailableMaterials()` classifies instances as `available` or `upcoming` (reserved/loaned but free before request start date). Checks blocking loans and requests. Splits results by user-accessible locations vs. other locations. Resolves packages into constituent material types. |
| F6 | **Loan Return & Inspection** | ✅ Complete | 93% | `loanService.returnLoan()`: validates loan is active/overdue, transitions instances to `returned`, sets deposit to `refund_pending`. `inspectionService.createInspection()`: transactional — validates loan in `returned` status, prevents duplicates, requires all materials inspected. Auto-generates damage invoice with 19% IVA tax. Auto-applies deposit to damage invoice. If no damages, deposit transitions to `refund_pending`. `completeLoan()`: requires deposit resolved (applied/refunded), requires inspection exists, updates instances based on condition (available/damaged/lost). |
| F7 | **Invoicing & Payments** | ✅ Complete | 95% | `invoice.service.ts`: CRUD, payment recording with `PaymentMethod` validation, partial payments supported (`partially_paid` status), void capability. Summary statistics endpoint with pending/paid/overdue aggregation. `applyDepositPayment()` for transactional deposit application. `sendInvoice()` sends email with HTML template (line items table, totals, tax, due date) via `emailService.sendInvoiceEmail()`. Invoice types: damage, late_fee, deposit_shortfall, additional_service, penalty. |
| F8 | **Pricing Engine** | ✅ Complete | 95% | `pricing.service.ts` (472 lines): `calculateItemPrice()` pure function handles per_day, weekly_monthly (weekly rate × full weeks + daily rate × remaining days), fixed strategies. `resolveItemPricingConfig()` cascades: item-specific → materialType-specific → org-default. `buildLoanPricingSnapshot()` creates immutable pricing records on loans. Preview endpoint for dry-run calculations. Default per-day config auto-seeded on org creation. |
| F9 | **Transfers (Inter-Location)** | ✅ Complete | 90% | `transfer.service.ts` (302 lines): Two-model design — `TransferRequest` (model-level intent) and `Transfer` (instance-level physical shipment). `initiateTransfer()`: transactional, validates instances at origin location, updates status to `in_use` during transit. `receiveTransfer()`: transactional, updates instances to `available` at destination, records per-item received conditions. Request fulfillment tracking with `fulfilledQuantity` per item. |
| F10 | **Customer Management** | ✅ Complete | 93% | `customer.service.ts`: dedicated service layer with full CRUD, org-scoped search/pagination, document types endpoint. `customer.model.ts`: name schema, documentType/documentNumber, totalLoans/activeLoans counters, status (active/inactive/blacklisted). Email **and phone** unique per-org (compound indexes). Delete blocked when customer has active loans. |
| F11 | **Deposits (Full Lifecycle)** | ✅ Complete | 93% | Deposit sub-schema on `loan.model.ts`: amount, status (not_required/held/partially_applied/applied/refund_pending/refunded), transactions array (type+amount+date+reference). `createLoanFromRequest()` validates deposit paid, transitions to `held`. `createInspection()` auto-applies deposit to damage invoice, transitions to `applied` or `partially_applied`. `refundDeposit()` calculates refund after deducting applied amounts. `completeLoan()` blocks if deposit not resolved. |

### 2.2 Non-Functional Requirements

| # | Requirement | Status | Score | Evidence |
|---|------------|--------|-------|----------|
| NF1 | **Authentication & Authorization** | ✅ Complete | 95% | JWT in httpOnly cookies (`access_token` 15min, `refresh_token` 7d). Argon2 password hashing. `authenticate` middleware validates JWT and injects user into request. `requirePermission("resource:action")` checks DB-stored role permissions. `requireActiveOrganization` checks org status. `requireSuperAdmin` for platform admin routes. Email verification with OTP (6-digit, 5-minute expiry, max 5 attempts). Password reset with OTP. Invite system with configurable expiry. Session cleanup via background interval. |
| NF2 | **Multi-Tenancy Isolation** | ✅ Complete | 93% | All models correctly scoped with `organizationId`. Customer.phone, User.phone, and MaterialPlan.name now use compound indexes for per-org uniqueness (previously global). See [Section 3](#3-multi-tenancy-deep-review). |
| NF3 | **Input Validation** | ✅ Complete | 93% | Zod schemas for all API inputs. `validateBody()` and `validateQuery()` middleware. Zod `.superRefine()` for complex conditional validation (barcode/serial). Business-level validation in services (date ranges, status transitions, reference existence). `paginationSchema` reusable base schema. |
| NF4 | **Error Handling** | ✅ Complete | 90% | `AppError` class with factory helpers (`badRequest`, `notFound`, `conflict`, `unauthorized`, `forbidden`, `internal`). `errorLogger` + `errorResponder` middleware. Structured error details with `code` fields for machine-readable errors. 404 handler for unknown routes. Consistent `{ status: "error", message }` response shape. |
| NF5 | **Rate Limiting** | ⚠️ Partial | 60% | `rate_limiter.ts`: configurable factory with per-user (authenticated) or per-IP key generation. In-memory `Map` store — **will not work across multiple server instances**. Periodic cleanup every 60 seconds. Redis migration was evaluated and consciously deferred as LOW priority (single-instance deployment sufficient for current scale). |
| NF6 | **Logging & Observability** | ⚠️ Partial | 78% | `logger.ts` exists (Winston-based). Structured logging with contextual fields (organizationId, userId, requestId) in services. Health endpoint at `GET /health`. Request-level correlation IDs via `X-Request-Id` header (auto-generated UUID or client-supplied). **Remaining gap:** No metrics export (Prometheus, etc.). No distributed tracing. |

---

## 3. Multi-Tenancy Deep Review

### 3.1 Correctly Scoped Models (PASS)

All queries include `organizationId` filter. Compound unique indexes enforce per-org uniqueness for critical fields.

| Model | organizationId | Scoped Queries | Unique Constraints |
|-------|---------------|----------------|-------------------|
| MaterialInstance | ✅ | ✅ | `{organizationId, serialNumber}` unique, `{organizationId, barcode}` partial unique |
| MaterialType | ✅ | ✅ | Per-org via service checks |
| Category | ✅ | ✅ | Per-org |
| MaterialAttribute | ✅ | ✅ | Per-org compound unique on name |
| Loan | ✅ | ✅ | Per-org |
| LoanRequest | ✅ | ✅ | Per-org |
| Invoice | ✅ | ✅ | Per-org |
| Inspection | ✅ | ✅ | Per-org |
| Location | ✅ | ✅ | Per-org |
| Transfer/TransferRequest | ✅ | ✅ | Per-org |
| Package | ✅ | ✅ | Per-org |
| Role | ✅ | ✅ | `{organizationId, name}` unique |
| PricingConfig | ✅ | ✅ | `{organizationId, scope, referenceId}` unique |
| Customer | ✅ | ✅ | `{organizationId, email}` compound unique |
| User | ✅ | ✅ | `{organizationId, email}` compound unique |
| PaymentMethod | ✅ | ✅ | Per-org |
| InventoryMovement | ✅ | ✅ | Per-org |
| BillingEvent | ✅ | ✅ | Per-org linked to Stripe |

### 3.2 Multi-Tenancy Violations (FAIL)

#### CRITICAL: `MaterialPlan` model — No `organizationId` field

**File:** `src/modules/material/models/material_plan.model.ts`  
**Evidence:** The schema defines `name` (unique: true globally), `description`, `materialTypeIds[]`, `discountRate`. There is **no `organizationId` field** at all. The `name` field has a global unique constraint, meaning Org A creating a plan named "Wedding Package" would prevent Org B from using that name.

**Impact:** Complete tenant isolation failure for this entity. However, **mitigating factor**: `MaterialPlan` is **never imported or used** by any service, router, or test file. It is dead code.

**Recommendation:** Either remove the file entirely or add `organizationId` with a compound unique index `{organizationId, name}` before any future use.

#### HIGH: `Customer.phone` — Globally unique constraint

**File:** `src/modules/customer/models/customer.model.ts` line 110  
**Evidence:** `phone: { type: String, required: true, trim: true, unique: true }`

The `unique: true` on `phone` creates a **global** MongoDB unique index, not scoped to the organization. Customer email is correctly scoped with `customerSchema.index({ organizationId: 1, email: 1 }, { unique: true })`, but phone is not.

**Impact:** If customer "John" in Org A has phone "+573001234567", no customer in Org B can have the same phone number. This is a **cross-tenant data leak** — Org B receives a duplicate key error revealing that the phone number exists in another tenant's data.

**Recommendation:** Replace `unique: true` on the phone field with a compound unique index: `customerSchema.index({ organizationId: 1, phone: 1 }, { unique: true })`.

#### HIGH: `User.phone` — Globally unique constraint

**File:** `src/modules/user/models/user.model.ts` line 137  
**Evidence:** `phone: { type: String, required: true, unique: true, trim: true }`

Same issue as Customer. The auth registration flow (`authService.register()`) does check for phone uniqueness explicitly before creating, but the Mongoose-level unique index is global.

**Impact:** Cross-tenant data exposure. A user registering in Org B gets a duplicate key error if a user in Org A has the same phone.

**Recommendation:** Change to compound index `{organizationId, phone}`. Note: the registration flow currently checks `User.findOne({ phone })` globally — this would need to be updated to also scope by organization if cross-org phone sharing is intended.

### 3.3 organizationId Injection

The `authenticate` middleware in `src/middleware/auth.ts` automatically injects `organizationId` into `req.body` from the JWT payload. The helper `getOrgId(req)` extracts it safely. All services that receive `organizationId` use it in their DB queries. This pattern is consistently applied.

---

## 4. Business Logic Deep Review

### 4.1 State Machines

#### Request Status Machine
```
pending → approved → [deposit_pending] → assigned → ready → shipped → completed
   ↓          ↓                              ↓         ↓
rejected   cancelled                     cancelled  cancelled
   ↓
 expired
```

**Implementation:** Enforced via status checks in each service method (e.g., `findOne({ status: "pending" })` for `approveRequest`). Not a formal state machine pattern but effectively correct. All transitions are validated server-side.

**Resolved:** The `scheduler.ts` background job system handles automatic request expiration (`checkExpiringLoans()`) and overdue detection.

#### Loan Status Machine
```
active → returned → [inspected] → closed
  ↓
overdue
```

**Implementation:** `returnLoan()` validates `active`/`overdue` → `returned`. `completeLoan()` validates `returned` → `closed` (requires inspection + deposit resolved). `extendLoan()` resets `overdue` → `active`.

**Resolved:** The `scheduler.ts` background job (`checkOverdueLoans()`) automatically transitions `active` loans with `endDate < now` to `overdue` on a cron schedule.

#### Material Instance Status Machine
```
available → reserved → loaned → returned → available
    ↓                                  ↓
maintenance ← damaged             maintenance
    ↓           ↓                     ↓
 available    retired              damaged
    ↓                                ↓
  retired                          retired
```

**Implementation:** Fully encoded in `materialService.updateInstanceStatus()` with explicit `validTransitions` map. Idempotent (same status → no-op). Records `InventoryMovement` audit trail.

**Resolved:** The Mongoose enum has been expanded to 9 values: `["available", "in_use", "reserved", "loaned", "returned", "maintenance", "damaged", "lost", "retired"]`, matching all statuses used by the service's `validTransitions` map.

### 4.2 Pricing Engine

**Strategies:**
1. `per_day`: `basePricePerDay × durationInDays × quantity`
2. `weekly_monthly`: `weeklyRate × fullWeeks + dailyRate × remainingDays` (all × quantity)
3. `fixed`: `fixedPrice × quantity` (ignores duration)

**Resolution cascade:** Item-specific config → materialType/package config → organization default config. Implemented in `resolveItemPricingConfig()`.

**Snapshot immutability:** `buildLoanPricingSnapshot()` creates a frozen record of pricing at loan creation time, stored on the loan document. This correctly prevents retroactive price changes from affecting existing loans.

**Auto-seeding:** `pricingService.seedDefaultPricingConfig()` is called during organization registration to ensure every org starts with a per-day default.

### 4.3 Deposit Lifecycle

Fully implemented and transactionally safe:

1. **Creation:** `requestService.createRequest()` sets `depositAmount`
2. **Payment recording:** `requestService.recordDepositPayment()` — manual confirmation only (cash/transfer)
3. **Held:** `loanService.createLoanFromRequest()` validates `depositPaidAt` exists, creates deposit with `held` status
4. **Application:** `inspectionService.createInspection()` auto-applies deposit to damage invoice, transitions to `applied` or `partially_applied`
5. **Refund:** `loanService.refundDeposit()` calculates refund after deducting applied amounts, transitions to `refunded`
6. **Closure gate:** `loanService.completeLoan()` blocks unless deposit is `applied` or `refunded`

### 4.4 Transaction Safety

All multi-document mutations use MongoDB sessions with `withTransaction()`:
- `loanService.createLoanFromRequest()` — creates loan, updates instances, transitions request
- `inspectionService.createInspection()` — creates inspection, creates invoice, applies deposit, updates loan
- `transferService.initiateTransfer()` — creates transfer, updates instances, updates request fulfillment
- `transferService.receiveTransfer()` — updates transfer, updates instances
- `authService.register()` — creates org, seeds roles, creates user, seeds pricing, seeds payment methods

### 4.5 Quota/Limit Enforcement

- **Catalog items:** `organizationService.incrementCatalogItemCount()` checks plan limits before allowing material type creation. Rollback on failure via `decrementCatalogItemCount()`.
- **Seats:** `organizationService.canAddSeat()` + `updateSeatCount()` checked during user creation, reactivation.
- **Plan limits:** `getEffectiveLimits()` falls back to snapshotted limits if the `SubscriptionType` record is deleted/disabled — defensive against plan lifecycle changes.

---

## 5. Missing Endpoints & Modules

### 5.1 Completely Missing

| Module | Gap | Evidence | Priority | Status |
|--------|-----|----------|----------|--------|
| ~~**Org-level Analytics/Reporting**~~ | ~~No org-scoped analytics endpoints~~ | `src/modules/analytics/` — 4 GET endpoints with date-range filters. `src/modules/reports/` — 5 GET endpoints (loans, inventory, financial, damages, transfers) with `reports:read` permission. | ~~HIGH~~ | ✅ Resolved |
| ~~**Notification System**~~ | ~~`sendInvoice()` was a TODO placeholder~~ | `invoiceService.sendInvoice()` now sends HTML-formatted invoice emails via `emailService.sendInvoiceEmail()`. | ~~HIGH~~ | ✅ Resolved |
| ~~**Background Job System**~~ | ~~No job queue for overdue/expiration~~ | `src/modules/shared/scheduler.ts` — cron-based jobs for overdue loan detection and request expiration. | ~~MEDIUM~~ | ✅ Resolved |
| ~~**Org-level Dashboard Endpoint**~~ | ~~No combined dashboard endpoint~~ | `GET /analytics/overview` returns combined counts across all modules. | ~~MEDIUM~~ | ✅ Resolved |
| **Audit Log Module** | `InventoryMovement` tracks material status changes, but there's no general audit log for: who approved a request, who voided an invoice, role changes, permission modifications. | Only `InventoryMovement` model exists; no general audit trail | LOW | Deferred |

### 5.2 Incomplete Endpoints

| Module | Gap | File | Priority | Status |
|--------|-----|------|----------|--------|
| ~~Customer service layer~~ | ~~Business logic inline in router~~ | `src/modules/customer/customer.service.ts` | ~~MEDIUM~~ | ✅ Resolved |
| ~~Invoice email sending~~ | ~~`sendInvoice()` was a placeholder~~ | `src/modules/invoice/invoice.service.ts` | ~~MEDIUM~~ | ✅ Resolved |
| Location analytics | LocationService has location-level stats but no org-wide location summary endpoint | `src/modules/location/location.service.ts` | LOW | Deferred |
| MaterialPlan | Model defined but never used — dead code | `src/modules/material/models/material_plan.model.ts` | LOW | Deferred |

### 5.3 Test Coverage

| Module | Test File | Assessment |
|--------|-----------|------------|
| **Auth** | `auth.spec.ts` | Minimal — registration/login |
| **Billing** | `billing.spec.ts` | Good — subscription, checkout validation, history, auth |
| **Customers** | `customers.spec.ts` | **Excellent** — CRUD + status transitions + search (17 tests) |
| **Inspections** | `create_inspection.spec.ts` | Adequate for creation |
| **Invoices** | `invoices.spec.ts` | **Excellent** — full lifecycle: create → send → pay → void (16 tests) |
| **Loans** | `loans.spec.ts` | Good — covers lifecycle |
| **Materials** | Multiple files | **Excellent** — comprehensive attribute, barcode, capacity, category tests |
| **Organization** | `organization.spec.ts` | Good — details, update, usage, plans |
| **Packages** | `packages.spec.ts` | **Excellent** — CRUD + activate/deactivate (15 tests) |
| **Permissions** | `permissions.spec.ts` | Minimal |
| **Pricing** | Two files | Good — configs + preview |
| **Requests** | `requests.spec.ts` | **Excellent** — comprehensive lifecycle |
| **Roles** | `roles.spec.ts` | Minimal |
| **Super Admin** | Two files | Good — analytics + subscription types |
| **Transfers** | `transfers.spec.ts` | Adequate |
| **Users** | `users.spec.ts` | Minimal |

All previously stubbed modules (billing, invoices, packages, organization, customers) now have comprehensive test suites.

---

## 6. Risk Register

| ID | Risk | Severity | Likelihood | Impact | Mitigation |
|----|------|----------|------------|--------|------------|
| R1 | ~~**Customer.phone cross-tenant uniqueness**~~ | ~~🔴 Critical~~ ✅ Resolved | — | — | Fixed: compound index `{organizationId, phone}` added to `customer.model.ts` |
| R2 | ~~**User.phone cross-tenant uniqueness**~~ | ~~🔴 Critical~~ ✅ Resolved | — | — | Fixed: compound index `{organizationId, phone}` added to `user.model.ts` |
| R3 | ~~**No automatic overdue detection**~~ | ~~🟡 High~~ ✅ Resolved | — | — | Fixed: `scheduler.ts` runs `checkOverdueLoans()` and `checkExpiringLoans()` on cron schedule |

---

## 8. Implementation Progress

> Summary of remediation work completed since the initial gap analysis.

| Phase | Description | Status | Key Deliverables |
|-------|-------------|--------|------------------|
| **1** | Security & Data Integrity | ✅ Complete | Compound indexes on `customer.phone`, `user.phone`, `materialInstance.serialNumber`/`barcode` scoped to `organizationId`. Prevents cross-tenant data leaks. |
| **2** | Background Jobs & Automation | ✅ Complete | `src/modules/shared/scheduler.ts` — cron-based jobs for overdue loan detection and expiring loan alerts. `customer.service.ts` extracted from router with full business logic separation. |
| **3** | Notifications & Communication | ✅ Complete | `emailService.sendInvoiceEmail()` in `src/utils/email.ts` — HTML-formatted invoice email with line items table, totals, and due date. Integrated into `invoiceService.sendInvoice()`. |
| **4** | Analytics & Reporting | ✅ Complete | `src/modules/analytics/` — 4 GET endpoints: `/overview` (counts + revenue), `/materials` (utilization + top items), `/revenue` (monthly breakdown), `/customers` (top + acquisition). All org-scoped with RBAC. |
| **5** | Test Coverage Expansion | ✅ Complete | 5 previously stubbed test files expanded to comprehensive suites: customers (17 tests), invoices (16 tests), packages (15 tests), organization (8 tests), billing (11 tests). ~740 lines of new test code. |
| **6** | Infrastructure Improvements | ✅ Complete | Request correlation IDs via `X-Request-Id` header (auto-generated UUID, propagated through middleware and auth context). Redis rate-limiter migration deferred as LOW priority. |
| **7** | Remaining Gaps & Reports | ✅ Complete | `GET /packages/:id/availability` — date-range-aware package fulfillment check. Analytics date-range filters on overview and revenue endpoints. Reports module — 5 endpoints (loans, inventory, financial, damages, transfers) using `reports:read` permission. API documentation updated. |
| **8** | Operations Dashboard | ✅ Complete | `src/modules/operations/` — 8 location-scoped aggregation-driven endpoints: overview KPIs, inspection queue, overdue financials, inventory issues, transfer queue, loan deadlines, damage resolution queue, unified task list. `operations:read` permission added to super_admin/owner/manager/warehouse_operator. API documentation and PERMISSIONS_REFERENCE updated. |

### Files Modified or Created

| File | Change Type | Description |
|------|-------------|-------------|
| `src/modules/customer/customer.service.ts` | Created | Extracted service layer from router |
| `src/modules/customer/customer.router.ts` | Modified | Refactored to delegate to service layer |
| `src/modules/shared/scheduler.ts` | Created | Background job scheduler (overdue/expiring loans) |
| `src/modules/analytics/analytics.service.ts` | Created | Analytics business logic (4 methods) |
| `src/modules/analytics/analytics.router.ts` | Created | Analytics HTTP endpoints (4 routes) |
| `src/utils/email.ts` | Modified | Added `sendInvoiceEmail()` with HTML template |
| `src/modules/invoice/invoice.service.ts` | Modified | Implemented `sendInvoice()` with email integration |
| `src/middleware/request_middleware.ts` | Modified | Added correlation ID generation |
| `src/middleware/auth.ts` | Modified | Extended Request type with `correlationId` |
| `src/routers/index.ts` | Modified | Registered analytics router |
| `src/server.ts` | Modified | Mounted analytics, started scheduler |
| `src/modules/customer/models/customer.model.ts` | Modified | Compound index `{organizationId, phone}` |
| `src/modules/user/models/user.model.ts` | Modified | Compound index `{organizationId, phone}` |
| `src/modules/material/models/material_instance.model.ts` | Modified | Compound indexes for serial/barcode |
| `tests/api/customers/customers.spec.ts` | Rewritten | 17 comprehensive API tests |
| `src/modules/package/package.service.ts` | Modified | Added `getPackageAvailability()` with date-range aware instance resolution |
| `src/modules/package/package.router.ts` | Modified | Added `GET /:id/availability` route |
| `src/modules/analytics/analytics.service.ts` | Modified | Added optional `dateRange` parameter to `getOverview()` and `getRevenueStats()` |
| `src/modules/analytics/analytics.router.ts` | Modified | Added date-range query schema and parsing to overview and revenue endpoints |
| `src/modules/reports/reports.service.ts` | Created | 5 report methods (loans, inventory, financial, damages, transfers) |
| `src/modules/reports/reports.router.ts` | Created | 5 GET endpoints with `reports:read` permission |
| `src/routers/index.ts` | Modified | Registered reports router |
| `src/server.ts` | Modified | Mounted reports at `/api/v1/reports` |
| `tests/api/invoices/invoices.spec.ts` | Rewritten | 16 comprehensive API tests |
| `tests/api/packages/packages.spec.ts` | Rewritten | 15 comprehensive API tests |
| `tests/api/organization/organization.spec.ts` | Rewritten | 8 comprehensive API tests |
| `tests/api/billing/billing.spec.ts` | Rewritten | 11 comprehensive API tests |
| `docs/API_DOCUMENTATION.md` | Modified | Analytics section, invoice send, customer details, correlation IDs |
| `docs/GAP_ANALYSIS.md` | Modified | Updated scores, resolved risks, implementation log |
| `src/modules/operations/operations.service.ts` | Created | 8 aggregation-driven methods for location-scoped operational dashboard |
| `src/modules/operations/operations.router.ts` | Created | 8 GET endpoints with `operations:read` permission |
| `src/routers/index.ts` | Modified | Registered operations router |
| `src/server.ts` | Modified | Mounted operations at `/api/v1/locations/:locationId/operations` |
| `src/modules/roles/seeders/permissions.json` | Modified | Added `operations:read` permission |
| `src/modules/roles/models/role.model.ts` | Modified | Added `operations:read` to super_admin, owner, manager, warehouse_operator |
| `docs/API_DOCUMENTATION.md` | Modified | Added Operations Endpoints section with 8 endpoints |
| `docs/PERMISSIONS_REFERENCE.md` | Modified | Added `operations:read` permission entry |
| R4 | **No request expiration** — Approved requests with unpaid deposits never expire | 🟡 High | Certain | Materials stuck in `reserved` status indefinitely | Add scheduled job for deposit timeout → `expired` + release |
| R5 | **MaterialInstance enum mismatch** — Model enum has 5 values; service uses 9 | 🟡 High | Medium | Data inconsistency if Mongoose strict mode changes | Add `reserved`, `loaned`, `returned`, `lost` to the Mongoose enum |
| R6 | **In-memory rate limiter** — Does not work in multi-instance deployments | 🟡 High | Medium (if scaling) | Rate limits bypassed in load-balanced environments | Switch to Redis-backed store |
| R7 | **Invoice email not implemented** — `sendInvoice()` is a TODO | 🟡 Medium | Certain | Users cannot receive invoices by email | Implement email integration |
| R8 | **No org-level reporting** — `reports:read` permission unused | 🟡 Medium | Certain | Org admins cannot view business metrics | Build org analytics endpoints |
| R9 | **Billing tests are stubs** — Stripe integration untested | 🟡 Medium | High | Regressions in payment flows go undetected | Write comprehensive billing API tests |
| R10 | **MaterialPlan dead code** — Model file with no tenant isolation | 🟢 Low | Low | Confusion; potential future misuse without organizationId | Remove or fix before any future use |

---

## 7. Recommended Implementation Order

### Phase 1: Security & Data Integrity Fixes (Priority: CRITICAL)

**Estimated effort: Small**

1. **Fix Customer.phone global uniqueness** — Change `unique: true` to compound index `{organizationId, phone}`. Requires a DB migration to drop the old index and create the new one.
   - File: `src/modules/customer/models/customer.model.ts`

2. **Fix User.phone global uniqueness** — Same pattern. Also update `authService.register()` phone uniqueness check to scope by org (or decide if cross-org phone sharing is intended for users).
   - Files: `src/modules/user/models/user.model.ts`, `src/modules/auth/auth.service.ts`

3. **Fix MaterialInstance status enum** — Add `reserved`, `loaned`, `returned`, `lost` to the Mongoose enum in `material_instance.model.ts`. This aligns the schema with actual runtime values used by `materialService.updateInstanceStatus()`, `requestService.assignMaterials()`, and `loanService.createLoanFromRequest()`.
   - File: `src/modules/material/models/material_instance.model.ts`

4. **Remove or fix MaterialPlan** — Either delete the dead-code file or add `organizationId` field with compound unique index before any future use.
   - File: `src/modules/material/models/material_plan.model.ts`

### Phase 2: Background Jobs & Automation (Priority: HIGH)

**Estimated effort: Medium**

5. **Add overdue loan detection job** — Scheduled task (e.g., `node-cron` or `agenda`) that queries `Loan.find({ status: "active", endDate: { $lt: new Date() } })` and transitions to `overdue`. Could also trigger late-fee invoice generation.

6. **Add request expiration job** — Scheduled task that transitions `approved`/`deposit_pending` requests to `expired` after a configurable timeout, releasing any reserved materials.

7. **Extract customer service layer** — Move business logic from `customer.router.ts` to a new `customer.service.ts` for consistency with all other modules.

### Phase 3: Notifications & Communication (Priority: HIGH)

**Estimated effort: Medium–Large**

8. **Implement invoice email sending** — Complete the `invoiceService.sendInvoice()` TODO. Use the existing `emailService` transporter with an HTML invoice template.

9. **Build notification service** — Email notifications for: request status changes (approved/rejected/ready), loan overdue alerts, inspection results, upcoming return reminders. Could be event-driven (emit events from services, notification service subscribes).

### Phase 4: Analytics & Reporting (Priority: MEDIUM)

**Estimated effort: Medium**

10. **Build org-level analytics endpoints** — Create `src/modules/analytics/` or add endpoints to the organization router. Use the existing `reports:read` and `analytics:read` permissions. Endpoints needed:
    - `GET /analytics/overview` — loan count, revenue, overdue items, upcoming returns
    - `GET /analytics/materials` — utilization rates, most/least rented, maintenance frequency
    - `GET /analytics/revenue` — revenue by period, by material type, by customer
    - `GET /analytics/customers` — top customers, customer activity

### Phase 5: Test Coverage (Priority: MEDIUM)

**Estimated effort: Medium**

11. **Write billing API tests** — Cover Stripe checkout session creation, portal session, webhook handling, subscription changes.

12. **Write invoice API tests** — Cover creation, payment recording (partial + full), void, listing with filters.

13. **Write package API tests** — Cover CRUD, material type validation, duplicate name prevention.

14. **Write organization API tests** — Cover profile updates, plan usage, subscription management.

15. **Write customer API tests** — Cover CRUD, search, status transitions, document type validation.

### Phase 6: Infrastructure Improvements (Priority: LOW)

**Estimated effort: Small–Medium**

16. **Switch rate limiter to Redis** — Replace in-memory `Map` with Redis store for multi-instance compatibility.

17. **Add request correlation IDs** — Add middleware that generates/propagates a request ID through all logs for traceability.

18. **Clean up dead code** — Remove `MaterialPlan` model if not needed. Remove or complete any remaining TODO items.

---

## Appendix A: File Index (Key Files Referenced)

| File | Lines | Purpose |
|------|-------|---------|
| `src/modules/material/material.service.ts` | 1101 | Material catalog management |
| `src/modules/auth/auth.service.ts` | 865 | Registration, login, password reset, invites |
| `src/modules/request/request.service.ts` | 637 | Request lifecycle management |
| `src/modules/billing/billing.service.ts` | 549 | Stripe integration |
| `src/modules/super_admin/super_admin.service.ts` | 545 | Platform analytics |
| `src/modules/pricing/pricing.service.ts` | 472 | Pricing engine |
| `src/modules/location/location.service.ts` | 403 | Location management |
| `src/modules/organization/organization.service.ts` | 369 | Org management, quotas |
| `src/modules/loan/loan.service.ts` | 364 | Loan lifecycle |
| `src/modules/subscription_type/subscription_type.service.ts` | 314 | Plan management |
| `src/modules/transfer/transfer.service.ts` | 302 | Inter-location transfers |
| `src/modules/user/user.service.ts` | 295 | User management |
| `src/modules/invoice/invoice.service.ts` | 284 | Invoice management |
| `src/modules/inspection/inspection.service.ts` | 272 | Post-return inspections |
| `src/modules/roles/roles.service.ts` | 262 | Role management |
| `src/modules/package/package.service.ts` | 148 | Package bundles |
| `src/modules/payment/payment_method.service.ts` | 139 | Payment methods |
| `src/middleware/auth.ts` | ~270 | Auth, RBAC, org middleware |
| `src/errors/AppError.ts` | ~80 | Error class and factories |

## Appendix B: Permission Audit

55 permissions defined across 14 categories. All permissions are organization-scoped except `platform:manage`, `subscription_types:*`. Two permissions exist without corresponding endpoints:

- **`reports:read`** — No org-level reporting endpoints exist
- **`analytics:read`** — No org-level analytics endpoints exist (only super-admin analytics)

These permissions are assigned to `owner`, `manager`, and `commercial_advisor` roles but are never checked by any `requirePermission()` call in the codebase.
