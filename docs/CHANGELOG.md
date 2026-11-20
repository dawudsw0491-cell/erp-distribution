# Changelog

## 2026-11-19 — Baseline audit and Master Data Hub navigation

- Added baseline repository, architecture, Master Data, backlog, decisions, known-issues, and test-evidence documentation.
- Added Product Models, Product Attributes, and Product Attribute Values to the existing Master Data Hub.
- Updated Hub copy from five submodules to eight work areas.
- Reused existing routes; no new CRUD implementation was introduced.
- No database, Inventory, authentication, authorization, or RLS code was changed.
- Work is isolated on branch `work/master-data-baseline-20261119`.

## 2026-11-20 — Unified Product Variant specifications

- Added RAM and ROM to the existing product attribute dictionary; reused existing COLOR and WARRANTY attributes.
- Added a SECURITY INVOKER RPC to save variant specifications in one database transaction under the caller's RLS permissions.
- Added an `master.update`-scoped policy to remove a variant-to-value mapping without deleting the reusable value or product assignment.
- Integrated RAM, ROM, color, and warranty inputs into variant create/edit and displays into variant detail.
- Full single-submit Product + initial Variant workflow remains open; SKU ownership and downstream transaction consumers are not yet canonicalized.

## 2026-11-19 — Centralize Brand creation

- Added `lib/master-data/brands.ts` as the shared server-only Brand creation implementation.
- Updated Product and Product Model actions to delegate to the shared helper.
- Preserved both existing action entry points and their return shape for existing forms.
- Shared helper centralizes normalization, permission check, existing-brand lookup, insert, duplicate handling, and route revalidation.
- No schema or Inventory changes.
