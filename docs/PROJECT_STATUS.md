# Project Status — HEXA CORE ERP Distribution

**Current implementation branch:** `fix/ui-masterdata-region-and-table-consistency-20261124`  
**Branch base:** `work/master-data-baseline-20261119` at `bb2d212bf375a9941d695486137301712f4ddd40`  
**Protected baseline:** `master` at `8eadef2a0cb7e03fa2eb3fdb194dee4987af2bfa`  
**Supabase:** `erp-distribution-dev`, PostgreSQL 17.11, ACTIVE_HEALTHY  
**Last live inspection:** 2026-11-24; see the dated execution note below. Historical sections below retain earlier snapshots and must not be treated as current without revalidation.

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
| Purchasing / Purchase Orders | PARTIAL — VARIANT SOURCE PORTED / LIVE POSTING BLOCKED | PO create source submits Variant ID and PO detail displays Variant SKU; live Development PO/GR RPC contract is not yet switched. Runtime workflow not tested. |
| Goods Receipt | PARTIAL | Creation/posting RPCs and tables exist; seven flagged SECURITY DEFINER grants hardened; end-to-end not tested |
| Inventory Movement | PARTIAL — VARIANT SOURCE PORTED / LIVE POSTING BLOCKED | Current branch actions/forms and history reads use Product Variant identity; live Development posting RPC remains Product-keyed until MD-014 is applied. Runtime posting tests absent. |
| Inventory Transfer | PARTIAL — VARIANT SOURCE PORTED / LIVE POSTING BLOCKED | Draft source and history now use Variant identity; legacy history without Variant is labelled unresolved. Live Development posting RPC remains Product-keyed; do not post until MD-014 is applied. |
| Inventory Balances / Valuation | BLOCKED — MD-014 | Dashboard and balance read surfaces count Variant SKU and expose unresolved Product-only rows separately. Development still has 154/188 NULL Variant IDs across six core tables; reconciliation and posting migration are not complete. |
| Stock Opname | PARTIAL | Session/item/unit count workflows and RPCs exist; approval/posting tests absent |
| Sales | BLOCKED — NOT IMPLEMENTED | Sidebar entry exists, but no Sales transaction tables or route. SALES-001 design defines SO → partial DO; DO posting is blocked until MD-014 variant-level Inventory is validated in Development. |
| Returns | BLOCKED — NOT IMPLEMENTED | No return transaction tables or posting RPCs. Requires source-document linkage, stock disposition, valuation, approval, and accounting rules. |
| Accounting | BLOCKED — NOT IMPLEMENTED | Finance permissions exist, but no chart-of-accounts, journal, fiscal-period, receivable/payable, or ledger tables were found in live Development. |
| Settings | PARTIAL — SOURCE IMPLEMENTED | `/settings` now provides a permission-aware administration hub to existing User Management, Master Data, and Warehouse routes. Company/system configuration and central audit viewer are not implemented. |
| Reporting / Analytics | NOT IMPLEMENTED | `reports.view` and `reports.export` permissions exist, but no dedicated reports route or validated reporting contracts are implemented. |

## Live database snapshot

- Current read-only table inventory: 54 public tables, all reported with RLS enabled.
- The Development migration ledger contains 26 applied migrations through `20261124062000`; this supersedes the four-entry historical snapshot below.
- Current Security Advisor reports four RLS-enabled tables without policies, 38 authenticated-executable SECURITY DEFINER functions, and one leaked-password protection warning. Findings require separate intent/permission review; no blanket privilege revocation was performed.
- Current Performance Advisor reports 46 unused-index findings and missing FK covering indexes. No indexes were removed or added.
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


## Product Management — atomic create workflow update (2026-11-20)

- Replaced the new-product write path with `create_product_with_variants(jsonb,jsonb)`, a SECURITY INVOKER PostgreSQL function. One call inserts the product, all initial variants, and their RAM/ROM/COLOR/WARRANTY mappings in a single database transaction.
- The product SKU remains generated by the existing `generate_product_sku()` sequence. Variant SKUs are generated as `<product SKU>-01`, `-02`, etc. Existing `products.sku` and `product_variants.variant_sku` columns and their existing references were not renamed, dropped, or migrated.
- The new-product form now supports one or more variants before saving, with optional barcode and RAM, ROM, color, warranty inputs. Existing warranty/attribute dictionaries are reused through `save_product_variant_specifications`; free-text values continue to become reusable dictionary entries.
- Product detail now displays its SKU variants and their mapped specifications, with a link to the existing variant-management route.
- Applied Supabase migration `20261120075428 create_product_with_variants_atomic`. Verified function exists, SECURITY DEFINER=false, anon EXECUTE=false, authenticated EXECUTE=true, and dependent SKU/specification RPC grants are available.
- Live row counts before/after implementation verification remained products=14, product_variants=5, product_variant_attribute_values=2; no product demo/operational rows were created or modified during migration.
- Customer and Supplier schemas/routes were not changed.
- Not yet verified: local TypeScript/build/lint, real authenticated browser submit, multi-variant save, uniqueness failure rollback, permission matrix, and detail-page runtime rendering. These remain required before MD-010 can be marked DONE.


- Follow-up migration `validate_atomic_product_variant_payload` hardened direct RPC validation: missing condition is rejected for goods, and variant barcode is checked against existing product-level barcodes before insert.


## Product Variant SKU and unit-label update — 2026-11-20

- Applied live migration `20261120081908 canonical_variant_sku_and_unit_label`.
- Added SECURITY INVOKER helper `next_product_variant_sku(uuid)`: locks the parent Product row, finds the highest existing numeric suffix, and generates the next available child SKU. It is shared by initial variant creation and subsequent variant creation; it does not rewrite or recycle existing SKUs.
- Added `create_product_variant_with_specs(uuid,text,text,jsonb)`, which creates a variant and persists RAM/ROM/COLOR/WARRANTY mappings in one database transaction.
- Updated the add-variant action to call the RPC. The manual SKU input was removed; the edit form continues to show the existing SKU read-only.
- Product unit default is now `Unit`; legacy `PCS/PC/PIECE/PIECES` values were normalized to `Unit` in the products master. No product, variant, or serialized-unit records were deleted.
- Live migration ledger confirms the new migration. Function grants and current row counts still require a focused read-back; no authenticated browser or local build/lint validation has been performed.

## Optional IMEI requirement — dependency finding

- Live schema already has `product_units`, `goods_receipt_units`, `goods_receipt_unit_identifiers`, and `product_unit_identifiers`.
- Current Goods Receipt logic requires a full set of serialized units and mandatory IMEI_1 when `products.tracking_type='imei'`; quantity-tracked products reject individual unit rows.
- Therefore optional IMEI with SKU/quantity fallback is a cross-module inventory behavior change, not a nullable UI field. It must cover receipt draft/posting, unit identity uniqueness, inventory movements, transfer, stock opname, and search before being enabled. This is not yet implemented.


## Implementation update — 2026-11-22

- Current branch: `fix/engineering-governance-masterdata-consolidation-20261120`.
- MD-014 source now includes Variant-level Inventory posting, valuation, Goods Receipt partial-IMEI behavior, transfer, reversal, and Stock Opname ports. The migration remains unapplied to Development.
- Application read contracts were aligned for Transfer history, Movement history, Purchase Order detail, Dashboard Inventory Overview, and Inventory Dashboard. Variant SKU is the canonical SKU count; Product-only balance rows are separately exposed as unresolved legacy data.
- Settings Administration Hub exists at `/settings` and reuses existing permission-aware routes; it does not create duplicate Master Data CRUD or unvalidated configuration tables.
- Vercel Preview deployment `dpl_AR5uxZFnhgdUK87FsPJK56yKwNDN` is READY on commit `04e73bab6c4b951853415f556b127d99b1117749`. Next.js compilation, TypeScript, and 58/58 static page generation passed. ESLint and authenticated runtime role/warehouse tests remain open.
- Development preflight still reports NULL Variant identity: inventory_balances 11/16, inventory_movements 9/9, inventory_valuation_logs 9/9, product_units 3/3, purchase_order_items 7/11, stock_opname_items 115/140. No Development or Production schema/data changes were made during this implementation pass.
- Sales, Returns, and Accounting remain blocked from operational posting until their Inventory and ledger dependencies are validated. No speculative transaction tables or fake dashboard KPIs were introduced.


## Current audit reconciliation — 2026-11-22

The historical status sections above preserve prior implementation evidence and earlier snapshots. The current consolidated audit is now recorded in `docs/PROJECT_AUDIT_2026-11-22.md`. The live Development catalog was re-read on 2026-11-22: 47 public tables (all RLS-enabled), 77 public functions, 44 SECURITY DEFINER functions, 33 non-internal triggers, 103 RLS policies, and 189 indexes. The applied migration ledger has eight entries through `20261121050458 rbac_warehouse_scope_alignment`. MD-014 remains unapplied and blocked by 154/188 NULL Variant IDs across six tables. Latest Vercel Preview is READY on commit `9dc9df91456a57b62b69318ea8d59c61ee79b6f0`. The audit is read-only; no database or Production mutation occurred.


## Execution note — 2026-11-24 (Point 1: Master Data + Inventory Foundation)

- Active branch at start of this execution: `fix/ui-masterdata-region-and-table-consistency-20261124`, commit `831f7c3d027f619735a831cbd882131977d6712b`.
- Confirmed the current Supabase Development inventory includes Product, Variant, Model, Brand, Category, Attribute, Product Unit/Identifier, Inventory Balance, Movement, Valuation, Purchasing, Goods Receipt, Sales Order, Delivery Order, Invoice and Payment tables. Transaction tables checked in the initial inventory were empty.
- Confirmed `private.enforce_warehouse_scope()` already protects `inventory_movements` on INSERT/UPDATE/DELETE by validating both OLD and NEW warehouse rows and preserving the trusted service-role path. A proposed duplicate public trigger was therefore immediately superseded by migration `20261124062000`; final database state has no duplicate public trigger/function. No business data was changed.
- Development migration ledger now has 26 entries through `20261124062000`. Source/ledger provenance remains open under GOV-001.
- Current Product/Variant UI and server action use the existing atomic `create_product_with_variants` RPC; no replacement CRUD or schema redesign was introduced.
- User previously validated local lint/build at commit `831f7c3`. No application source files changed in this execution, so that result still applies to the application source at that commit; the current docs/migration commits have not been locally pulled or rebuilt.
- No Vercel deployment was requested or triggered. Production was not accessed or modified.
- Next Point 1 work remains: trace Product/Model/Brand/category/attribute dependencies against all downstream transaction consumers; complete serialized IMEI/Serial lifecycle review; reconcile migration provenance; then update the same MD-003/MD-004/MD-006/MD-011/MD-013/MD-014 backlog rows with evidence.
