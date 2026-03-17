# Quick Start: module-feature-complete Prompt

## What This Prompt Does

Generates complete, production-ready implementations for REST API features:

- **Router** with Zod validation + auth middleware
- **Service** with business logic, error handling, RBAC
- **Tests** using Playwright with data factories
- **API Documentation** sections for API_DOCUMENTATION.md

## How to Invoke

In any VS Code chat (Copilot Chat):

```
/module-feature-complete
Create POST /payments/intent for Stripe payment intent creation
```

Or provide more context:

```
/module-feature-complete
Module: billing
Feature: POST /billing/refund
Auth: owner only, requires billing:refund permission
Input: paymentIntentId, amount, reason
Output: refund object with status, amountRefunded, etc.
Errors: 400 invalid amount, 403 non-owner, 404 intent not found
```

## Minimal Example Input

```
Module: loans
Feature: POST /loans/:id/extend for extending loan end date
```

The prompt will ask clarifying questions if needed, then generate all four artifacts.

## Output Structure

The prompt generates:

```
## Router: src/modules/loans/loans.router.ts
[full router code]

## Service: src/modules/loans/loans.service.ts
[service methods]

## Tests: tests/api/loans/loans.spec.ts
[complete test suite]

## API Documentation Sections
#### POST /loans/:id/extend
[markdown for API_DOCUMENTATION.md]
```

## Key Built-In Patterns

✅ Separation of concerns (router → service → db)
✅ Zod validation with custom error messages
✅ Auth + RBAC via middleware
✅ Error handling via AppError factory helpers + error responder
✅ HttpOnly cookie authentication
✅ Playwright tests with pre-authenticated requests
✅ Consistent response JSON shape
✅ Helper utilities (generateRandomEmail, etc.)

## Integration Checklist

After generation:

- [ ] Copy router code to `src/modules/<module>/<module>.router.ts`
- [ ] Copy service code to `src/modules/<module>/<module>.service.ts`
- [ ] Register router in `src/routers/index.ts` if new module
- [ ] Copy tests to `tests/api/<module>/<module>.spec.ts`
- [ ] Copy API documentation to `docs/API_DOCUMENTATION.md` (under appropriate section)
- [ ] Run `npm test:<module>` to verify tests pass
- [ ] Run `npm run build` to check TypeScript

## Example: Create POST /customers/blacklist

```
/module-feature-complete
Module: customer
Feature: POST /customers/:id/blacklist to mark customer as blacklisted
Permissions: commercial_advisor can create/read, manager can blacklist
Input: customerId (path), reason (body, required)
Transitions: active → blacklisted, should prevent new loans
Tests: success, already blacklisted, customer not found, unauthorized
```

This will generate a complete, tested, documented feature ready to merge.

## Tips

- **Be specific about permissions**: "owner only", "requires materials:update", etc.
- **Mention related features**: "depends on subscription check", "affects inventory count"
- **Include error cases**: The prompt will create tests for them
- **Use existing patterns**: "Similar to POST /loans/:id/extend but for X"
- **API docs**: The prompt auto-generates sections; you paste them into API_DOCUMENTATION.md

## Questions?

Refer to `.github/prompts/module-feature-complete.prompt.md` for:

- Full architecture context
- Code pattern examples
- Implementation checklist
- Key principles

Or ask in chat: "Show me the auth pattern for this service" or "What's the idempotency strategy?"
