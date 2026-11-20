# Project Status — HEXA CORE ERP Distribution

**Current implementation branch:** `work/hexa-core-implementation-20261120`  
**Branch base:** `work/master-data-baseline-20261119` at `bb2d212bf375a9941d695486137301712f4ddd40`  
**Protected baseline:** `master` at `8eadef2a0cb7e03fa2eb3fdb194dee4987af2bfa`  
**Supabase:** `erp-distribution-dev`, PostgreSQL 17.11, ACTIVE_HEALTHY  
**Last live inspection:** 2026-11-20

## Module status (current evidence)

| Module | Status | Evidence / Notes |
|---|---|---|
| Authentication / User / RBAC | PARTIAL | Auth, profile, role, permission, warehouse access, audit and deletion tables/actions exist; runtime role matrix and RLS tests not executed |
| Master Data Hub | DONE on implementation branch | Eight existing work areas linked; Brand creation shared |
| Product | PARTIAL | Product CRUD and SKU RPC exist; model/attribute relation model needs consolidation |
| Product Variant | PARTIAL | CRUD and downstream Inventory/GR references exist; lifecycle and uniqueness tests not executed |
| Category | PARTIAL | CRUD exists; hierarchy/attribute applicability dependencies need tests |
| Brand | PARTIAL | Shared create helper exists; no dedicated canonical management route |
| Product Model | PARTIAL | Route/actions and live table exist; deletion and assignment/value ownership needs runtime validation |
| Product Attributes / Values | PARTIAL | Global Attribute and Attribute Value CRUD exist; list counts/search and duplicate-check handling were hardened. Complete product assignment and variant-value maintenance flow is not present in inspected Product/Variant detail routes; legacy SQL 22/23 differs from live schema |
| Supplier | PARTIAL | Main CRUD plus address/contact/bank/product relations exist; end-to-end validation absent |
| Customer | PARTIAL | CRUD and live table exist; no Sales consumer route present |
| Warehouse | PARTIAL | CRUD exists; Inventory/Purchasing dependencies and warehouse access policy need tests |
| Purchasing / Purchase Orders | PARTIAL | PO CRUD/workflow RPCs and tables exist; runtime workflow not tested |
| Goods Receipt | PARTIAL | Creation/posting RPCs and tables exist; seven flagged SECURITY DEFINER grants hardened; end-to-end not tested |
| Inventory Movement | PARTIAL | Draft/post/reversal functions and tables exist; runtime posting tests absent |
| Inventory Transfer | PARTIAL | Source and live RPCs exist; runtime transfer/rollback tests absent |
| Inventory Balances / Valuation | PARTIAL | Balance and valuation tables/logs exist; reconciliation and valuation tests absent |
| Stock Opname | PARTIAL | Session/item/unit count workflows and RPCs exist; approval/posting tests absent |
| Sales | NOT IMPLEMENTED | Sidebar entry exists; no route page in app tree |
| Returns | NOT IMPLEMENTED | Sidebar entry exists; no route page in app tree |
| Accounting | NOT IMPLEMENTED | Sidebar entry exists; no route page in app tree |
| Settings | NOT IMPLEMENTED | Sidebar entry exists; no route page in app tree |
| Reporting / Analytics | NOT IMPLEMENTED / SCOPE UNKNOWN | No dedicated module identified in current route tree |

## Live database snapshot

- 47 tables in schema `public`; all reported with RLS enabled.
- 73 public functions, 44 SECURITY DEFINER functions, 20 non-internal triggers, 102 RLS policies, 189 indexes.
- Supabase migration ledger initially returned no migrations. After this session it records `20261120012027 hexa_core_harden_public_definer_function_execute`.
- Live schema confirms `product_models`, `product_attribute_assignments`, and `product_variant_attribute_values` exist. This resolves the previous source-only uncertainty about table existence, but not their full provenance or canonical semantics.
- Security advisor initially reported seven SECURITY DEFINER functions executable by anon. A migration has been applied and verified: anon execution is false for all seven; authenticated execution remains true for six application/RLS functions. Trigger function `generate_customer_code()` is not directly executable by authenticated.
- Security advisor reports four RLS-enabled tables without policies and four overlapping permissive policy cases.
- Performance advisor reports missing covering indexes for foreign keys and 36 unused indexes. No indexes were changed.

## Work completed in this execution

- Created isolated implementation branch; master remains untouched.
- Applied Supabase migration `hexa_core_harden_public_definer_function_execute`.
- Added matching source-controlled migration `database/50_hexa_core_harden_public_definer_function_execute.sql`.
- Verified grants after migration.
- Replaced the branch backlog with one module-oriented shared backlog.

## Verification limits

Build, lint, browser flows, and transaction-level tests have not yet been run in this execution. A Vercel success status from a previous commit is not treated as current build/test proof. No demo data was reset or deleted.


## Latest implementation update — Product Attribute Values

- Replaced application-side full result counting with exact head-only database counts for total, active, and inactive Attribute Values.
- Bounded and sanitized the Attribute Value list search term before constructing PostgREST OR filters.
- Changed create/update duplicate checks to fail closed when duplicate lookup queries return errors.
- No Supabase schema or data changes were made.
- The complete assignment workflow between products, attributes, and variant attribute values remains unimplemented/under review.
- Source-level verification only; build, lint, and runtime tests remain pending.

## Product Management consolidation — current status

- Master Data Hub now exposes one Product Management workspace for product setup instead of separate Category, Product Model, Product Attribute, and Attribute Value work areas.
- Sidebar links to those standalone product setup screens have been removed.
- Existing routes and database structures remain temporarily while the unified workflow and all downstream dependencies are mapped.
- Variant create/edit now accepts Warranty as free text with datalist suggestions. New text is saved as a reusable `WARRANTY` attribute value and linked to the specific variant through `product_variant_attribute_values`; existing templates are reused case-insensitively after normalization.
- Seeded reusable warranty templates: SEIN, TAM, B-CELL, DISTRIBUTOR, INTERNASIONAL, GARANSI TOKO, TANPA GARANSI. No duration/year is included.
- RAM/ROM/color integration and unified product create/edit workflow remain incomplete.
- No database objects or demo rows were deleted in this navigation change.
- Product SKU ownership remains unresolved: live schema contains both products.sku and product_variants.variant_sku.
- Permanent cleanup is blocked on tracing all Purchasing, Goods Receipt, Inventory, serialized-unit, valuation, RPC, trigger, and PostgREST dependencies.
