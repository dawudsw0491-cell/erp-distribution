# Shared Backlog — HEXA CORE ERP Distribution

Priority: P0 Critical, P1 High, P2 Medium, P3 Low. Status is module/work-item status, not SDLC phase.

| ID | Priority | Module / Work Item | Status | Evidence / Exit Criteria |
|---|---|---|---|---|
| MD-001 | P1 | Master Data Hub exposes approved master work areas | DONE | Hub exposes Product Management as the single product setup workspace plus Customers, Suppliers, and Warehouses; standalone product setup links are removed from Hub/sidebar |
| MD-002 | P1 | Centralize Brand creation | DONE | Product and Product Model delegate to shared server-only helper |
| MD-003 | P1 | Canonical Product Model / Product Attribute relationship | PARTIAL | Product Variant create/edit/detail now manages RAM, ROM, COLOR, and WARRANTY via the existing attribute dictionary and a SECURITY INVOKER RPC; product-level assignment is created by the RPC. Runtime permission tests, Product Model lifecycle, and PostgREST relationship dependency tracing remain open |
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
| QA-001 | P1 | Build, lint, and automated test evidence | IN PROGRESS | Local build passed at commit `3d08b33` (57 routes generated); lint at that commit reported 16 errors / 11 warnings. Source fixes committed after that run; current head still requires one consolidated local build/lint rerun. No test suite identified in package manifest |
| NAV-001 | P2 | Resolve sidebar links without matching routes | NOT IMPLEMENTED / SCOPE CHECK | /sales, /returns, /accounting, /settings need scope decision or route implementation |
| INT-001 | P1 | Verify Purchasing → Goods Receipt → Inventory | PARTIAL | RPCs/tables exist; execute controlled end-to-end tests with demo fixtures |
| DOC-001 | P2 | Replace starter README with operating guide | OPEN | README still create-next-app template |
| GOV-001 | P1 | Reconcile Git migration files with Supabase migration ledger | OPEN | Live migration ledger now records four migrations (security ACL, warranty templates, RAM/ROM attributes + mapping delete policy, specification RPC). Historical numbered SQL files still require provenance reconciliation |
| GOV-002 | P1 | Maintain single shared backlog and decision log | IN PROGRESS | This file is the canonical backlog on implementation branch |

| MD-010 | P0 | Consolidate all product setup into one Product Management workspace | IN PROGRESS | New Product form now captures product master, category, multiple initial variants, barcode, RAM, ROM, color, and warranty in one submission. Added SECURITY INVOKER RPC `create_product_with_variants` to persist product + all variants + specification mappings in one database transaction; product detail now displays the variant/SKU/specification summary. Live migrations `20261120075428 create_product_with_variants_atomic` and `20261120075733 validate_atomic_product_variant_payload` applied; SECURITY INVOKER/ACL verified. Pending local build/lint, authenticated browser submission/rollback tests, detail edit/inline management completion, and retirement of legacy routes after dependency tracing |
| MD-011 | P0 | Canonicalize SKU identity across Product, Variant, Purchasing, and Inventory | OPEN | Live schema stores both products.sku and product_variants.variant_sku; trace all transaction FKs/RPCs before choosing canonical owner |
| MD-012 | P0 | Remove redundant Product Model / Attribute maintenance surfaces and schema | OPEN | Retire UI only after inline Product Management replacement; drop DB objects only after complete code/RPC/constraint dependency map and replacement migration |

| DASH-001 | P0 | Dashboard KPI cards use live domain data | OPEN | Screenshot + app/page.tsx confirm Total Produk, Total Persediaan, Penjualan Hari Ini, and Total Piutang are hardcoded zero placeholders. Bind product count to products, inventory to inventory_balances, sales to posted sales documents, and receivables to posted customer AR ledger once the corresponding schema/module exists; show permission and query failure states distinctly |
| DASH-002 | P0 | Dashboard Inventory Overview correctness and navigation | PARTIAL | Current app/page.tsx reads inventory_balances, warehouses, product_variants, inventory_movements; validate aggregate semantics, warehouse scoping, valuation reconciliation, and link cards to Inventory routes |
| DASH-003 | P1 | Dashboard business activity feed | OPEN | Activity table is currently a static empty placeholder. Build a normalized read model from committed Purchase Orders, Goods Receipts, posted Inventory Movements, Sales, Returns, and Accounting entries as each module is implemented; preserve source references/status and permission filtering |
| DASH-004 | P1 | Dashboard system health indicators | OPEN | Server status, DB connectivity, backup timestamp, uptime, and overall condition currently render as placeholders. Implement truthful server/database probes; backup and uptime remain unavailable until infrastructure telemetry/scheduler source is configured. Never display green/healthy without a successful check |
| DASH-005 | P0 | Dashboard integration contract for every module | OPEN | Each module delivery must define dashboard contribution (KPI/activity/alert), source table or RPC, posting/status inclusion rule, permission/RLS scope, date/timezone rule, empty/error/loading state, and navigation target. Do not wire unimplemented Sales/Returns/Accounting to invented data; activate each dashboard contribution only after its source module is implemented and verified |
| INT-002 | P0 | Cross-module entity and dashboard integration matrix | OPEN | Maintain source-of-truth and dependency mapping for Product/Variant↔Purchasing↔Goods Receipt↔Inventory, Customer↔Sales↔Receivables↔Returns↔Accounting, Supplier↔Purchasing↔Payables↔Accounting, Warehouse↔Inventory/Stock Opname/Transfer, User/RBAC↔all actions and dashboard visibility. Verify FK, RPC, RLS, posting and reconciliation behavior before marking connected |

## Execution rules

- Do not repeat completed work items.
- Preserve valid existing implementation.
- Do not classify a module from phase status; classify each module PARTIAL, INVALID, NOT IMPLEMENTED, or DONE using route, action, schema, authorization, and runtime evidence.
- Demo records are test data. Their presence is not a reason to preserve defective schema or duplicated modules. No bulk deletion/reset without a separate approved migration.
- Every database change must have a matching SQL migration in this repository and a verified live result.
- A work item is DONE only after implementation, tests, and dependent-module checks are recorded.
