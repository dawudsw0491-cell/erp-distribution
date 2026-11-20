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
| Master Data Hub | DONE on implementation branch | One Product Management workspace plus Customers, Suppliers, and Warehouses; shared Brand creation helper retained |
| Product | PARTIAL | Product CRUD and SKU RPC exist; model/attribute relation model needs consolidation |
| Product Variant | PARTIAL | CRUD plus RAM/ROM/COLOR/WARRANTY specification create/edit/detail; specifications persist through RLS-aware SECURITY INVOKER RPC. Browser submission and permission-matrix tests remain open |
| Category | PARTIAL | CRUD exists; hierarchy/attribute applicability dependencies need tests |
| Brand | PARTIAL | Shared create helper exists; no dedicated canonical management route |
| Product Model | PARTIAL | Route/actions and live table exist; deletion and assignment/value ownership needs runtime validation |
| Product Attributes / Values | PARTIAL | Variant specification assignment/value maintenance is integrated into Product Variant create/edit/detail for RAM, ROM, COLOR, WARRANTY. Standalone CRUD routes remain off Hub/sidebar; legacy SQL 22/23 provenance and PostgREST consumers still require reconciliation |
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
- Supabase migration ledger contains four applied migrations: `20261120012027 hexa_core_harden_public_definer_function_execute`, `20261120023844 seed_product_warranty_templates`, `20261120031233 seed_ram_rom_variant_specifications_and_delete_policy`, and `20261120031359 save_product_variant_specifications_rpc`.
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

User ran `npm.cmd run build` successfully at local commit `3d08b33` (Next.js 16.4.3; TypeScript passed; 57 routes generated). At the same commit, ESLint reported 16 errors and 11 warnings. Follow-up source fixes are committed through `8828366`; they have not yet been validated by a local build/lint run. Current Vercel status for `8828366` is PENDING. Browser flows, permission-matrix tests, and transaction-level tests remain unrun. No demo data was reset or deleted.


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
- RAM/ROM/COLOR/WARRANTY are now integrated into Product Variant create/edit/detail. The single-submit Product + initial Variant create/edit workflow remains incomplete.
- No database objects or demo rows were deleted in this navigation change.
- Product SKU ownership remains unresolved: live schema contains both products.sku and product_variants.variant_sku.
- Permanent cleanup is blocked on tracing all Purchasing, Goods Receipt, Inventory, serialized-unit, valuation, RPC, trigger, and PostgREST dependencies.

## Latest implementation update — unified variant specifications

- Added live RAM and ROM product attributes. Existing COLOR and WARRANTY attributes are reused; no duplicate attribute dictionary was created.
- Variant create, edit, and detail views now expose RAM, ROM, color, and warranty in one specification section.
- Typed values are saved into the existing product_attribute_values dictionary and reused case-insensitively for subsequent variants.
- Added save_product_variant_specifications(jsonb) as a SECURITY INVOKER RPC. The function applies all specification changes in one database transaction and leaves RLS/permission checks active.
- Added a narrowly scoped DELETE policy on product_variant_attribute_values for users with master.update; this deletes only a variant-to-value mapping, not the shared value or product-level assignment.
- Verified live function ACL: SECURITY DEFINER=false, anon EXECUTE=false, authenticated EXECUTE=true, service_role EXECUTE=true.
- Verified live attributes RAM, ROM, COLOR, WARRANTY are active and the new DELETE policy targets authenticated users with master.update.
- Runtime UI submission and browser verification are still pending. New dictionary values and assignments still require master.create policies; edit-only users can update existing mappings and clear mappings but cannot create new dictionary values unless they also have master.create.
- The Product create/edit form still saves the product master independently of variant creation. Full single-submit Product + initial Variant workflow remains open because variant SKU ownership is not yet canonicalized across Purchasing and Inventory.


## Dashboard integration audit — 2026-11-20

Evidence: user-provided localhost screenshots and source file `app/page.tsx`.

- Top KPI cards (`Total Produk`, `Total Persediaan`, `Penjualan Hari Ini`, `Total Piutang`) are hardcoded constants with zero values; they are not live database aggregates.
- Inventory Overview does query live `inventory_balances`, active `warehouses`, active `product_variants`, and posted `inventory_movements`. Its query currently loads all balance rows into application memory; warehouse/user scoping, aggregation semantics, and valuation reconciliation still require review.
- Business Activity is a hardcoded empty row, not an event feed.
- System Health labels (server, database, backup, uptime) are static placeholders; they do not perform health checks.
- The live public schema currently has no Sales, Returns, or Accounting transaction tables. Dashboard sales and receivables must remain unavailable/explicitly not implemented until those modules and their posting/ledger sources exist.
- Added DASH-001..DASH-005 and INT-002 to the shared backlog. These are dependency-driven requirements: dashboard integrations are activated only after each source module is implemented and verified.
- No dashboard source code or Supabase schema/data was changed in this audit update.
