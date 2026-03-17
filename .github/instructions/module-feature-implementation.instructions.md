---
description: "Use when implementing or modifying backend TypeScript features in LendEvent, especially REST API module work (routers, services, API tests, and API docs). Enforces modular architecture, auth/RBAC middleware, validation, error propagation, and documentation updates."
name: "LendEvent Module Feature Implementation"
applyTo: "**/*.ts, docs/API_DOCUMENTATION.md"
---

# LendEvent Module Feature Implementation Rules

For module endpoint features, always follow `.github/prompts/module-feature-complete.prompt.md`.

## Architecture And Separation

- Keep concerns separated.
 - Routers handle HTTP concerns (routing, middleware, validation, response mapping).
 - Services handle business logic and use `AppError` factory helpers for expected failures (e.g., `AppError.badRequest()`, `AppError.notFound()`). Do not instantiate `new AppError(...)` directly.
- Do not put business rules directly in router handlers.

## Router Requirements

Apply this section when adding or changing API endpoints.

- Use `authenticate` and organization middleware when route is org-scoped.
- Protect routes with `requirePermission("resource:action")` when applicable.
- Validate request payloads/queries with Zod and `validateBody`/`validateQuery` before service calls.
- In async handlers, propagate errors with `next(err)` rather than custom inline error formatting.
- Return consistent success shape: `{ status: "success", data }`.
- Add route-level JSDoc explaining endpoint purpose.

## Service Requirements

Apply this section when a change touches business logic in module services.

- Keep HTTP framework details out of service methods.
- Perform early checks for org state, quotas, and business preconditions.
 - Use `AppError` factory helpers (e.g., `AppError.badRequest(message, details)`, `AppError.notFound(message, details)`, `AppError.internal(message, cause)`) for user-facing errors instead of `new AppError(...)`.
- Return DTO/plain objects instead of leaking raw persistence documents.

## Test Requirements

Apply this section when endpoint behavior or service behavior changes.

- Add or update Playwright API coverage under `tests/api/<module>/`.
- Include happy-path and failure-path tests (400/403/404/409 as appropriate).
- Assert status code and response body contract (`status`, `data`/error fields).
- Reuse test helpers from `tests/utils/` for random data and setup.

## Documentation Requirements

- If any router endpoint is added/changed/removed, update `docs/API_DOCUMENTATION.md` in the same change. This is a hard rule.
- Document each endpoint with method/path, auth/permission requirements, request parameters, example request, success responses, and error conditions.
- Keep documentation format aligned with existing sections and table style.

## Permissions & RBAC Updates

- When a feature introduces a new permission key (for example `resource:action`), the change MUST include three coordinated updates in the same change:
	- Add the canonical permission entry to `src/modules/roles/seeders/permissions.json` with the fields: `_id`, `displayName`, `description`, `category`, and `isPlatformPermission` (boolean).
	- Add the permission string to the appropriate role in `src/modules/roles/models/role.model.ts` by updating the `rolePermissions` entry for the role that should receive it. If the permission is platform-only, add it to `super_admin_only_permsissions` instead.
	- Update `docs/PERMISSIONS_REFERENCE.md` to document the new permission, its purpose, and whether it is platform-only.

- After adding the permission entries, run the permissions seeder to apply changes to the database. First perform a dry-run to verify output, then run the seeder against the target database only after confirming DB access and environment variables.
	- Dry-run (PowerShell):
		- `$env:DRY_RUN='1'; npx tsx src/modules/roles/seeders/permissions.seeder.ts`
	- Real run (only after review/approval and correct DB credentials):
		- `npx tsx src/modules/roles/seeders/permissions.seeder.ts`

- Why: keeping the canonical `permissions.json`, the in-repo role mapping (`rolePermissions`), and the persisted Permission documents in sync is required so clients and APIs receive a correct, discoverable permissions catalogue.

## Quality Guardrails

- Prefer small, incremental edits that preserve established project patterns.
- Do not introduce new endpoint styles or response envelopes that diverge from existing module conventions unless explicitly requested.
- If feature requirements are unclear, ask targeted clarifying questions before implementing core business rules.
