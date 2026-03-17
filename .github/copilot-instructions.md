## Purpose

This file tells the Copilot-style agent how to contribute code to this repository. It summarizes the project's module feature implementation rules, documents expectations for routers/services/tests/docs, and prescribes Git commit and branching practices (Gitflow) for meaningful, reviewable changes.

## Scope

- Applies to changes in `src/` TypeScript modules, routers, services, tests under `tests/api/`, and documentation in `docs/`.
- For non-TypeScript assets (infra, Docker, CI) follow repository conventions and ask for clarification when in doubt.

## High-level rules (derived from module-feature-implementation.instructions.md)

- Architecture
  - Keep concerns separated: routers handle HTTP, services handle business logic, models handle persistence.
  - Routers must not contain business rules; call the service layer and propagate errors with `next(err)`.

- Router Requirements
  - Use `authenticate` and organization middleware for org-scoped endpoints.
  - Protect endpoints with `requirePermission("resource:action")` as appropriate.
  - Validate incoming data with Zod + `validateBody` / `validateQuery` before calling services.
  - Return the standard success envelope: `{ status: "success", data }`.
  - Add JSDoc at the top of new route handlers describing purpose and permission requirements.

- Service Requirements
  - Keep framework/HTTP concerns out of services.
  - Perform early business checks (org state, quotas, preconditions) and use `AppError` factory helpers for expected failures (e.g., `AppError.badRequest()`, `AppError.notFound()`). Avoid instantiating `new AppError(...)` directly.
  - Return plain DTOs / POJOs (not raw Mongoose documents) from service methods.

- Test Requirements
  - Add Playwright API tests under `tests/api/<module>/` for new or changed endpoints.
  - Cover happy paths and failure paths (400/403/404/409 where applicable).
  - Use existing test helpers from `tests/utils/` and follow the established setup/teardown patterns.

- Documentation Requirements
  - Update `docs/API_DOCUMENTATION.md` for any router changes in the same change/PR.
  - Document method/path, permissions, params, example requests/responses, and error conditions.

## Developer workflow & Gitflow (meaningful commits and branches)

- Branching model (Gitflow-inspired):
  - `main` — protected production branch. Merge only release branches or hotfixes.
  - `develop` — integration branch for ongoing work. Feature branches branch from and merge back into `develop` via PR.
  - `feature/<short-descriptive-name>` — for individual features or tasks (branch from `develop`).
  - `release/<version>` — for preparing releases; merge to `main` and `develop` after release.
  - `hotfix/<short-desc>` — urgent fixes off `main`, merged back to `develop` and `main`.

- Commit guidance
  - Make small, focused commits that each do one logical thing (e.g., "Add MaterialAttribute model", "Validate attribute values in material service").
  - Use conventional commit style in messages: `<type>(<scope>): <short summary>`
    - Examples: `feat(material): add attribute model and indexes` , `fix(material): validate attribute enum values`
  - Include a longer body when necessary explaining rationale, design choices, and any migration steps.
  - When a change includes generated or large files (docs, seeders), prefer a clear commit message and consider a dedicated commit for generated artifacts.

- Pull request (PR) checklist
  - Branch is based on `develop` (unless hotfix) and targets `develop`.
  - Include tests that cover new behavior; all existing tests should pass locally.
  - Update `docs/API_DOCUMENTATION.md` and `docs/PERMISSIONS_REFERENCE.md` when adding endpoints or permissions.
  - Explain migration steps (DB indexes, seeders) in the PR description when applicable.
  - Ensure lint/formatting (`npm run lint` / `npm run format`) and run a TypeScript build check (`npx tsc --noEmit --project tsconfig.build.json`).

## Quality & safety

- Favor minimal, incremental changes; avoid broad sweeping edits unrelated to the ticket.
- Do not bypass RBAC or permission checks in code or tests; use test accounts and seeded permissions where required.
- If a data migration or breaking change is required, include a migration plan and coordinate with the repository owner.

## Automation and seeding

- When adding new permission keys, update `src/modules/roles/seeders/permissions.json` and add corresponding entries to `src/modules/roles/models/role.model.ts` where rolePermissions are defined.

## Notes for the agent

- Before making edits, search the codebase for patterns and existing examples (e.g., see `src/modules/material` for similar patterns).
- Use the repo's existing Zod/Mongoose patterns and error helpers (e.g., `AppError`) rather than inventing new ones.
- When in doubt, open a short question to the user asking for the single decision needed.

Example prompts you can use to ask the human maintainer:

- "This change requires adding a DB migration. Do you want me to add a migration script or handle it inline?"
- "Should `unit` be optional or required for attributes across all organizations? I can make it optional and default to empty string."

End of instructions.
