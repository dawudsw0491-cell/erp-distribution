# Changelog

## 2026-11-19 — Baseline audit and Master Data Hub navigation

- Added baseline repository, architecture, Master Data, backlog, decisions, known-issues, and test-evidence documentation.
- Added Product Models, Product Attributes, and Product Attribute Values to the existing Master Data Hub.
- Updated Hub copy from five submodules to eight work areas.
- Reused existing routes; no new CRUD implementation was introduced.
- No database, Inventory, authentication, authorization, or RLS code was changed.
- Work is isolated on branch `work/master-data-baseline-20261119`.

## 2026-11-19 — Centralize Brand creation

- Added `lib/master-data/brands.ts` as the shared server-only Brand creation implementation.
- Updated Product and Product Model actions to delegate to the shared helper.
- Preserved both existing action entry points and their return shape for existing forms.
- Shared helper centralizes normalization, permission check, existing-brand lookup, insert, duplicate handling, and route revalidation.
- No schema or Inventory changes.
