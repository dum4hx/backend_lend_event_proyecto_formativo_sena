---
name: "module-feature-complete"
description: "Use when: building REST API endpoints for a module. Generates router + service + Playwright tests + API documentation sections. Handles auth, permissions, error handling, validation, and separates concerns (routing, business logic, persistence). Integrates with existing LendEvent architecture."
argument-hint: "Module name and feature description (e.g., 'billing module, POST /billing/checkout-session')"
---

# Module Feature Implementation Prompt

You are implementing a feature for the LendEvent event-rental management API. Your task is to create:

1. **Router** — Express endpoints with Zod validation, auth middleware, and error handling
2. **Service** — Business logic layer with clean separation of concerns
3. **Tests** — Playwright API tests with parametrized scenarios
4. **API Documentation** — Sections for API_DOCUMENTATION.md

## Architecture Context

### Project Structure

- **Modules**: `src/modules/<module>/{.<module>.router.ts, .<module>.service.ts, models/, types/}`
- **Middleware**: Centralized in `src/middleware/{auth.ts, validation.ts, error_responder.ts, etc.}`
- **Testing**: Playwright-based API tests in `tests/api/<module>/<module>.spec.ts`
- **Utils**: Helpers in `tests/utils/{helpers.ts, setup.ts}`

### Stack & Conventions

- **Framework**: Express 5.x with TypeScript
- **Validation**: Zod schemas for request/response validation
- **Auth**: HttpOnly cookies (`access_token`, `refresh_token`), middleware-based auth + RBAC
- **Error Handling**: Custom `AppError` exception class thrown from service, caught and formatted by middleware
- **Database**: MongoDB/Mongoose (implicit through models)
- **Testing**: Playwright with storage state (pre-authenticated requests), `expect()` for assertions

### Core Patterns

#### 1. **Router Structure** (auth & validation)

```typescript
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { <service> } from "./<module>.service.ts";
import { validateBody, validateQuery } from "../../middleware/validation.ts";
import { authenticate, requirePermission, getOrgId } from "../../middleware/auth.ts";

const <moduleRouter> = Router();
<moduleRouter>.use(authenticate, requireActiveOrganization); // if applicable

// Validation schemas
const schemaName = z.object({ /* fields */ });

// Routes
/**
 * ENDPOINT_DESCRIPTION
 */
<moduleRouter>.METHOD(
  "/path",
  requirePermission("resource:action"),
  validateBody(schemaName),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await <service>.methodName(getOrgId(req), req.body);
      res.status(201).json({ status: "success", data });
    } catch (err) {
      next(err);  // let error middleware handle it
    }
  }
);

export default <moduleRouter>;
```

#### 2. **Service Structure** (business logic, RBAC, error handling)

```typescript
import { AppError } from "../../errors/AppError.ts";

class <Service> {
  async methodName(orgId: string, payload: <Type>): Promise<any> {
    // Validate org quota, permissions, etc.
    if (!org) throw new AppError(404, "Organization not found");

    // Business logic
    // interact with models, other services

    return result;  // return DTO or document
  }
}

export const <service> = new <Service>();
```

#### 3. **Test Structure** (Playwright, storage state, data factories)

```typescript
import { test, expect } from "@playwright/test";
import {
  generateRandomEmail,
  generateRandomPhone,
} from "../../utils/helpers.ts";

test.describe("<Module> Module", () => {
  test("GET /path - should [assertion]", async ({ request }) => {
    const response = await request.get("path");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.data).toEqual(/* expected */);
  });

  test("POST /path - should [assertion]", async ({ request }) => {
    const payload = {
      /* test data */
    };
    const response = await request.post("path", { data: payload });
    expect(response.status()).toBe(201);
    // assertions
  });

  test("Error case: [scenario]", async ({ request }) => {
    const response = await request.post("path", { data: { invalid: true } });
    expect(response.status()).toBe(400); // or 403, 404, etc.
    const body = await response.json();
    expect(body.status).toBe("error");
  });
});
```

#### 4. **API Documentation Format** (markdown sections for API_DOCUMENTATION.md)

- **Endpoint heading**: `#### METHOD /endpoint`
- **Parameters table**: Method, Location (body/path/query), Type, Required, Description
- **Permission note**: `**Permission Required:** resource:action` or None
- **Example request** (curl or code block)
- **Response sections**: Status codes with example JSON
- **Error responses**: Table with Status, Condition, Message
- **Notes**: Edge cases, rate limits, special behaviors

---

## Inputs You Should Gather

When implementing a feature, **use the conversation context OR ask clarifying questions** about:

1. **Module name**: `<module>` being extended (e.g., `billing`, `loans`, `materials`)
2. **Feature scope**: What endpoints/flows? (e.g., "POST for subscription checkout, PATCH for seat updates")
3. **Auth & permissions**: Who can call it? (e.g., `owner` role, `billing:*` permissions)
4. **Data model**: What fields/validation? (e.g., required/optional, formats, min/max)
5. **Business rules**: Quotas, state machines, side effects? (e.g., "check catalog limit before creating material")
6. **Error scenarios**: What failures? (e.g., "403 if non-owner", "400 if invalid email")
7. **Rate limits**: Any throttling or special handling?
8. **Related services**: Dependencies on other modules? (e.g., "billing depends on subscription_type")

---

## Implementation Checklist

### Router

- [ ] Import service, validation schemas, middleware
- [ ] Use `authenticate` + `requireActiveOrganization` if org-scoped
- [ ] Apply `requirePermission()` to protected routes
- [ ] Define Zod validation schemas (inline or imported)
- [ ] Use `validateBody()` / `validateQuery()` middleware
- [ ] Handle errors with `next(err)` (don't res.status().json directly)
- [ ] Return consistent JSON shape: `{ status: "success", data }` or `{ status: "error", details, message }`
- [ ] Comment each route with JSDoc describing purpose

### Service

- [ ] Separate business logic from HTTP concerns
- [ ] Validate quotas, org state, permissions as early checks
- [ ] Throw `AppError(status, message, details?)` for user-facing errors
- [ ] Return DTOs (plain objects), not Mongoose documents directly
- [ ] Use dependency injection or service references for cross-module calls
- [ ] Add JSDoc for public methods

### Tests

- [ ] Set up `test.describe()` for the module
- [ ] Use pre-authenticated `request` object (from storage state)
- [ ] Test happy path (201/200 responses)
- [ ] Test error cases (400/403/404/409 errors)
- [ ] Use helper functions for data generation (`generateRandomEmail()`, etc.)
- [ ] Assert both status AND response body structure
- [ ] Cover edge cases: missing fields, duplicate records, permission denial

### API Documentation

- [ ] Add endpoint heading, parameter table, permission note
- [ ] Include example request (curl or prose description)
- [ ] Document all response codes and error conditions
- [ ] Add notes for special behaviors (rate limits, defaults, validation rules)
- [ ] Update Table of Contents if adding new section

---

## Output Format

When you generate implementation code, structure it as:

```
## Router: src/modules/<module>/<module>.router.ts

[full router file content]

## Service: src/modules/<module>/<module>.service.ts

[full service file content or methods to add]

## Tests: tests/api/<module>/<module>.spec.ts

[full test file content or new tests]

## API Documentation Sections

[markdown sections ready to copy into API_DOCUMENTATION.md, with appropriate heading level]
```

If any part is incomplete or skeletal, mark it clearly and explain what remains.

---

## Key Principles

- **Separation of Concerns**: Routers handle HTTP; services handle logic; models/db are separate
- **Error Propagation**: Services throw; middleware catches and formats
- **Validation Early**: Check Zod schemas before touching db; fail fast
- **Tests Are Contracts**: Test files document the API contract; keep them comprehensive
- **DRY**: Reuse helpers from `tests/utils/`, middleware, validation, and service patterns
- **Permissions**: Always check auth and RBAC before touching data; model trust boundaries explicitly
- **Idempotency**: Where sensible, make operations idempotent (e.g., accept duplicate creates, return existing)

---

## Help & Context

If you need context:

- Router patterns: See `src/modules/auth/auth.router.ts` or `src/modules/user/user.router.ts`
- Service patterns: See `src/modules/auth/auth.service.ts` or any `.service.ts` file
- Test patterns: See `tests/api/users/users.spec.ts` or `tests/api/auth/auth.spec.ts`
- API docs format: See [API_DOCUMENTATION.md](../../docs/API_DOCUMENTATION.md)

If the spec is unclear, **ask the user directly in the conversation** rather than guessing; then adjust your implementation.
