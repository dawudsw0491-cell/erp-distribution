# Architecture and Implementation Decisions

## ADR-001 — Preserve the existing Master Data entities and routes

**Date:** 2026-11-19  
**Status:** Accepted

The current Master Data routes are reused. The Hub is a navigation/index page, not a second CRUD implementation. Product, Category, Customer, Supplier, Warehouse, Product Model, Product Attributes, and Product Attribute Values remain distinct work areas.

**Reason:** Existing pages/actions are implemented and other modules consume their IDs. Duplicating CRUD or creating a new master table increases regression risk.

## ADR-002 — Do not change Inventory schema or posting logic during the initial Master Data cleanup

**Date:** 2026-11-19  
**Status:** Accepted

No changes are made to Inventory tables, RPCs, valuation, transfer, stock opname, unit tracking, approval, posting, or reversal.

**Reason:** Inventory depends on Product Variant IDs and warehouse IDs; changes require dependency and regression tests.

## ADR-003 — Keep Product Variant nested under Product

**Date:** 2026-11-19  
**Status:** Accepted provisionally

Existing routes place variants under Product detail. SQL and application code show Inventory and Goods Receipt depend on variant identifiers. No independent variant module is introduced.

## ADR-004 — Defer attribute model consolidation

**Date:** 2026-11-19  
**Status:** Deferred

Application source references more than one attribute-value relation pattern, while committed SQL explicitly defines one of those patterns. No table is dropped, renamed, or merged until the live schema and historical migration source are verified.

## ADR-005 — Isolate implementation from master

**Date:** 2026-11-19  
**Status:** Accepted

Changes are made on `work/master-data-baseline-20261119`, based on the verified master HEAD. The `master` branch is not updated by this implementation.


## ADR-006 — One user-facing Product Management workspace

**Date:** 2026-11-20  
**Status:** Accepted and implemented on branch `fix/engineering-governance-masterdata-consolidation-20261120`

Product, category, product model, product attributes, and attribute values are one user-facing Product Management workspace. Legacy list/new/detail/edit route entry points for Product Models, Product Attributes, Product Attribute Values, and Product Categories redirect to `/products`. Existing server actions, tables, RPCs, and relationships are retained until a dependency-safe retirement migration is proven. No duplicate CRUD workspace is permitted.

## ADR-007 — Evidence-based completion and no repetitive audit loops

**Date:** 2026-11-20  
**Status:** Accepted

A task is executed against one backlog ID and one active implementation branch. Re-audit only changed scope or failed evidence. DONE requires source commit, relevant automated checks, applicable database verification, Preview READY, and an affected-flow smoke test. Infrastructure-blocked checks are reported as BLOCKED and are not retried repeatedly without a changed condition.


## ADR-008 — Optional IMEI with aggregate SKU fallback

**Date:** 2026-11-20  
**Status:** Implemented in source; pending migration validation and application

For products configured with IMEI tracking, Goods Receipt may register zero or more identified units up to the received quantity. Each identified unit is tracked through `product_units` and `product_unit_identifiers`; the untagged remainder is posted as aggregate SKU inventory with a NULL `product_unit_id`. Transfers preserve this distinction: an identified unit transfer supplies its unit ID and quantity one, while aggregate SKU transfers leave the unit ID NULL. Stock opname stores aggregate IMEI count separately from individual unit counts and reconciles their sum. Serial-number products remain fully serialized and mandatory per unit. This is one integrated tracking policy, not a second inventory module.


## ADR-009 — Query-aware loading across core ERP modules

**Date:** 2026-11-21  
**Status:** Accepted; global route fallback implemented, client-query audit pending

The loading experience is standardized across the first implementation phase: Dashboard; Master Data (Product Management and its submodules, Customers, Suppliers, Warehouses); Purchasing (Purchase Order and Goods Receipt); and Inventory (Stock Balance, Movement, IMEI Registry, Transfer, Stock Opname, and existing submodules).

Sales, Returns, Accounting, and Settings are explicitly deferred to a later phase after those modules are implemented.

The loading indicator must reflect actual work required to render the active view. Server-rendered route data uses Next.js route loading boundaries and Suspense/streaming. Client-side requests that are necessary for the active view use a shared pending-request tracker with concurrency-safe accounting and guaranteed release in `finally`; failures terminate loading and are surfaced through the page's error handling. Cached data should not create a false loading state. Background polling, long-lived realtime subscriptions, and unrelated requests must not hold the global navigation indicator open. Artificial minimum durations are not a substitute for query completion.

The existing loader visual treatment is preserved. No database schema, posting logic, permissions, or production resources are changed as part of this work. Completion is tracked in QA-002 and requires route-by-route fast/slow/parallel/error/cache verification, local lint/build, Preview READY, and authenticated smoke tests.
