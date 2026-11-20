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
