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


## ADR-010 — Sales recognition at Delivery Order posting

**Date:** 2026-11-21  
**Status:** Accepted

Sales is recognized when a Delivery Order (DO) is successfully posted. Posting a Sales Invoice is not the event that recognizes the sale.

The Sales module must preserve the distinction between:
- order commitment (Sales Order),
- physical goods issue / delivery (posted Delivery Order),
- billing document (Sales Invoice).

Inventory reduction and the sales-recognition event must be coordinated with the DO posting transaction. Invoice creation/posting must not recognize the same sale a second time. Revenue account mapping, tax treatment, receivable recognition, cost-of-goods-sold accounting, partial delivery, cancellation/reversal, and payment terms remain separate design decisions and must be resolved before implementing their respective postings.

No live schema, database migration, or Production resource is changed by accepting this decision.


## ADR-011 — Allow partial Delivery Order fulfillment

**Date:** 2026-11-21  
**Status:** Accepted

A Sales Order may be fulfilled through multiple Delivery Orders. Each successfully posted DO fulfills and recognizes only the quantities included in that DO. The Sales Order remains partially fulfilled while any ordered quantity remains outstanding; it becomes fully fulfilled only when all eligible quantities have been delivered.

Each DO posting must coordinate the stock reduction and sales-recognition event for its own quantities. The outstanding quantity remains visible as backorder / unfulfilled quantity and must not be recognized as delivered or sold. Invoice documents must reference the relevant delivered quantities and must not duplicate sales recognition.

This decision establishes partial fulfillment behavior only. It does not yet decide stock reservation, availability checks, backorder release, customer credit/payment terms, invoicing aggregation, cancellation/reversal, or accounting/tax treatment. No live schema, database migration, or Production resource is changed by accepting this decision.


## ADR-012 — Soft reservation with transactional allocation at DO posting

**Date:** 2026-11-21  
**Status:** Accepted

Sales Orders use soft reservation. Confirming an SO records its outstanding demand as a reservation indicator but does not physically reduce on-hand inventory or permanently lock stock against other orders. The system exposes On Hand, Reserved, and Available quantities; Available is calculated from on-hand stock less eligible active soft reservations within the applicable warehouse and SKU/variant scope.

A Sales Order may remain open with an unavailable quantity; that quantity is shown as outstanding/backorder rather than treated as delivered. Reservation priority and allocation must be deterministic and visible. Because soft reservations are not exclusive locks, the system must revalidate and allocate stock transactionally when a Delivery Order is posted. Concurrent DO postings must not consume the same available quantity or create negative stock. The stock reduction and sales-recognition event for each posted DO must commit atomically.

This decision does not yet define the exact reservation priority/expiry/release rules, warehouse substitution/transfer behavior, credit/payment terms, invoice aggregation, cancellation/reversal, or accounting/tax treatment. These must be designed before implementing their respective workflows. No live schema, database migration, or Production resource is changed by accepting this decision.


## ADR-013 — Flexible Sales Invoice grouping from posted Delivery Orders

**Date:** 2026-11-21  
**Status:** Accepted

The Sales Invoice workflow supports both:
- creating an invoice for one posted Delivery Order; and
- combining eligible posted Delivery Orders into one invoice.

The user may choose the grouping at invoice creation. Only posted DO quantities are eligible for billing. Each invoice line must retain its source DO-line reference and the quantity billed against that source. The cumulative invoiced quantity for a DO line must never exceed its valid delivered quantity. Duplicate billing and billing from draft, cancelled, or otherwise ineligible DOs must be prevented by server-side validation and database transaction constraints/locking as appropriate.

If only part of a delivered quantity is invoiced, the remaining delivered-but-unbilled quantity remains available for a later invoice. Invoice posting is a billing/receivable workflow and must not create a second sales-recognition or inventory-reduction event; those events remain tied to DO posting under ADR-010.

This decision establishes invoice grouping and quantity linkage only. Customer/currency/tax grouping constraints, invoice numbering, receivable recognition, payment terms, credit notes, cancellation/reversal, and accounting mappings remain design gates before implementing those postings. No live schema, database migration, or Production resource is changed by accepting this decision.
