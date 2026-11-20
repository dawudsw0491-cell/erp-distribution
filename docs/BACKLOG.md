# Shared Backlog — HEXA CORE ERP Distribution

Priority: P0 Critical, P1 High, P2 Medium, P3 Low. Status is module/work-item status, not SDLC phase.

| ID | Priority | Module / Work Item | Status | Evidence / Exit Criteria |
|---|---|---|---|---|
| MD-001 | P1 | Master Data Hub exposes all existing master routes | DONE | Hub links to eight existing master work areas on this branch |
| MD-002 | P1 | Centralize Brand creation | DONE | Product and Product Model delegate to shared server-only helper |
| MD-003 | P1 | Canonical Product Model / Product Attribute relationship | PARTIAL | Live composite FKs enforce variant/product, product/attribute assignment, and attribute/value consistency; app currently exposes Attribute and Attribute Value CRUD, but no complete product-assignment/variant-value maintenance flow was found in inspected routes; PostgREST relationship dependencies still require full source tracing |
| MD-004 | P1 | Source-controlled DDL for Product Model and attribute relations | PARTIAL | Live DB contains product_models, product_attribute_assignments, product_variant_attribute_values; legacy SQL 22/23 definitions differ materially from live schema; reconcile provenance before changing DDL |
| MD-005 | P2 | Dedicated Brand management route | NOT IMPLEMENTED | Decide whether inline shared brand helper is sufficient or standalone CRUD is required |
| MD-006 | P1 | Product / Variant / Model ownership and lifecycle | PARTIAL | Product create/edit UI and server actions already read, validate, and persist model_id; brand_id is also stored on Product and must remain consistent with Product Model.brand_id. Lifecycle and transaction-level verification remain open |
| MD-007 | P2 | Centralize canonical top-level product category definitions | DONE — SOURCE UPDATED | Product server validation and client recommendation now import one shared constant from lib/master-data/categories.ts |
| MD-008 | P2 | Centralize Product category recommendation rules | DONE — SOURCE UPDATED | Product create/edit forms now share `recommendProductCategory` from lib/master-data/product-classification.ts; edit/new recommendation logic no longer drifts |
| MD-009 | P1 | Product Attribute Values query and duplicate-check reliability | PARTIAL | Exact filtered counts replace fetching every matching row; search terms are bounded/sanitized; create/update duplicate lookup errors now fail closed. Build/runtime verification remains pending |
| SEC-001 | P0 | Remove unintended PUBLIC/anon EXECUTE from SECURITY DEFINER functions | DONE — DB VERIFIED | Migration applied 20261120012027; anon=false for seven flagged functions; authenticated access retained where needed |
| SEC-002 | P0 | Resolve RLS-enabled tables without policies | PARTIAL | Advisor flags import_indonesia_provinces, import_indonesia_regencies, sku_registry, user_deletion_requests; determine intended access and validate grants |
| SEC-003 | P1 | Review SECURITY DEFINER and privilege surface | PARTIAL | 44 SECURITY DEFINER functions; inventory complete, review authorization/ACLs function-by-function |
| SEC-004 | P1 | Consolidate overlapping permissive RLS policies | OPEN | Four overlapping policy pairs reported on user_profiles, user_roles, user_warehouse_access |
| PERF-001 | P2 | Review missing FK covering indexes | OPEN | Supabase performance advisor findings; only add indexes after workload and duplicate-index analysis |
| PERF-002 | P3 | Review unused indexes | OPEN | 36 unused-index findings; usage window and intended workload must be considered before removal |
| QA-001 | P1 | Build, lint, and automated test evidence | OPEN | No test script/suite in package manifest; build and lint must run on current branch |
| NAV-001 | P2 | Resolve sidebar links without matching routes | NOT IMPLEMENTED / SCOPE CHECK | /sales, /returns, /accounting, /settings need scope decision or route implementation |
| INT-001 | P1 | Verify Purchasing → Goods Receipt → Inventory | PARTIAL | RPCs/tables exist; execute controlled end-to-end tests with demo fixtures |
| DOC-001 | P2 | Replace starter README with operating guide | OPEN | README still create-next-app template |
| GOV-001 | P1 | Reconcile Git migration files with Supabase migration ledger | OPEN | Repository has 48 numbered SQL files; live migration list initially empty, now records HEXA migration only |
| GOV-002 | P1 | Maintain single shared backlog and decision log | IN PROGRESS | This file is the canonical backlog on implementation branch |

| MD-010 | P0 | Consolidate all product setup into one Product Management workspace | IN PROGRESS | Master Data Hub and sidebar no longer expose Category, Product Model, Product Attributes, or Attribute Values as separate work areas. Integrated create/edit of SKU variants and specifications, route retirement, and schema cleanup remain open |
| MD-011 | P0 | Canonicalize SKU identity across Product, Variant, Purchasing, and Inventory | OPEN | Live schema stores both products.sku and product_variants.variant_sku; trace all transaction FKs/RPCs before choosing canonical owner |
| MD-012 | P0 | Remove redundant Product Model / Attribute maintenance surfaces and schema | OPEN | Retire UI only after inline Product Management replacement; drop DB objects only after complete code/RPC/constraint dependency map and replacement migration |

## Execution rules

- Do not repeat completed work items.
- Preserve valid existing implementation.
- Do not classify a module from phase status; classify each module PARTIAL, INVALID, NOT IMPLEMENTED, or DONE using route, action, schema, authorization, and runtime evidence.
- Demo records are test data. Their presence is not a reason to preserve defective schema or duplicated modules. No bulk deletion/reset without a separate approved migration.
- Every database change must have a matching SQL migration in this repository and a verified live result.
- A work item is DONE only after implementation, tests, and dependent-module checks are recorded.
