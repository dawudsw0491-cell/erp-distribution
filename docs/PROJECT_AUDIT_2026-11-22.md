# Project Audit — HEXA CORE ERP Distribution
**Audit date:** 2026-11-22  
**Repository:** `dawudsw0491-cell/erp-distribution`  
**Implementation branch:** `fix/engineering-governance-masterdata-consolidation-20261120`  
**Audited branch commit:** `9dc9df91456a57b62b69318ea8d59c61ee79b6f0`  
**Protected baseline:** `master` at `8eadef2a0cb7e03fa2eb3fdb194dee4987af2bfa`  
**Supabase Development:** `erp-distribution-dev` / `vwxzlvsigxeopibnfuhp`  
**Vercel:** `hexa-core` / `prj_DMJrgbdIkKhg2IpCV8bzYzhOphRk`

## 1. Audit scope and evidence

This audit reconciles the current implementation branch, project governance documents, the MD-014 migration source, live Supabase Development catalog and migration ledger, Supabase security/performance advisors, and Vercel deployment records.

The implementation branch is 431 commits ahead of `master` and 0 commits behind it. `master` remains the protected baseline and was not modified by this audit. The latest Vercel Preview record points to commit `9dc9df91456a57b62b69318ea8d59c61ee79b6f0` and is `READY`.

**Preservation boundary:** committed work on the GitHub implementation branch is preserved. This remote audit cannot inspect the Windows working tree or recover local-only/uncommitted files. Do not run `git reset --hard`, `git clean`, or destructive branch operations. Preserve local uncommitted work separately before any synchronization.

## 2. Completed / source-implemented work

### Governance and architecture
- Isolated implementation work from protected `master`.
- One shared module-oriented backlog, decision log, project status, integration matrix, and inventory identity audit are maintained in the implementation branch.
- GitHub is the source of implementation/migration files; Supabase Development is the source of actual database state.
- ADRs establish Product/Variant ownership, optional IMEI aggregate fallback, Sales recognition at posted Delivery Order, partial DO fulfillment, FIFO soft reservation, and invoice grouping.
- No demo/test-data reset or cleanup was performed in this audit.

### Master Data and Product
- One user-facing Product Management workspace consolidates Product, Category, Product Model, Product Attributes, and Attribute Values; legacy entry points redirect rather than exposing duplicate CRUD surfaces.
- Customer, Supplier, and Warehouse work areas remain separate master entities.
- Shared Brand creation helper and centralized category/classification rules are in source.
- Product and initial Variants/specification creation has an atomic SECURITY INVOKER RPC source implementation; database migrations for atomic product/variant creation, payload validation, and canonical variant SKU/unit label are present in the live ledger.
- Product Variant specification UI supports RAM, ROM, COLOR, and WARRANTY using the shared attribute dictionary.
- Reusable warranty templates are present in source/database history: SEIN, TAM, B-CELL, DISTRIBUTOR, INTERNASIONAL, GARANSI TOKO, TANPA GARANSI.
- Product SKU remains parent identity; Variant SKU is the inventory identity. Physical removal of legacy master structures remains deferred pending dependency proof.

### Authentication, RBAC, security and warehouse scope
- Authentication, profiles, roles, permissions, warehouse access, audit/deletion request structures and authorization helpers exist.
- Security hardening migrations are present in Development migration history, including public function execute hardening and warehouse-scope alignment.
- Application/runtime role matrix and cross-warehouse allow/deny tests remain incomplete.

### Purchasing and Inventory
- Purchase Order source create path sends Variant IDs and PO detail displays Variant SKU.
- Goods Receipt, Inventory Movement, Transfer, Stock Balance, serialized-unit registry, and Stock Opname source paths have Variant-aware changes.
- Inventory Movement and Transfer histories display Variant SKU where available; legacy Product-only rows are labelled unresolved, not guessed.
- Dashboard and Inventory Overview count unique Variant IDs as SKUs and expose Product-only legacy balance rows separately.
- Optional IMEI behavior is source-ported: identified IMEI units are individually tracked; untagged remainder is aggregate Variant quantity. Serial remains unit-based.
- MD-014 migration source includes Variant-keyed movement/valuation, PO/GR, transfer, quantity reversal, Stock Opname, constraints, preflight, and ACL controls. It is not applied to Development.

### Dashboard, UX and Settings
- Dashboard KPI behavior distinguishes unavailable Sales/AR data from zero when no authoritative transaction source exists.
- Inventory overview is Variant-SKU aware.
- Shared route loading uses plain text status rather than artificial progress.
- Realtime filters/debounce and pagination reset have been implemented in selected Product, Purchasing and Inventory screens.
- `/settings` is a permission-aware administration hub linking existing routes; it does not create duplicate CRUD or speculative settings tables.

## 3. Module implementation status

| Module | Audit status | Current boundary |
|---|---|---|
| Authentication / User / RBAC | PARTIAL | Source and live structures exist; role matrix, warehouse boundary and RLS runtime tests remain |
| Master Data Hub | IMPLEMENTED IN SOURCE | Consolidated Product Management plus Customer, Supplier, Warehouse work areas |
| Product / Variant / specifications | PARTIAL | CRUD and atomic create source exist; browser/permission/rollback tests remain |
| Purchasing / PO | PARTIAL — VARIANT SOURCE PORTED | Variant-aware source; live posting contract still requires MD-014 |
| Goods Receipt | PARTIAL — VARIANT SOURCE PORTED | Partial-IMEI behavior is source-only pending migration replay and runtime tests |
| Inventory Movement / Transfer | PARTIAL — VARIANT SOURCE PORTED | Variant-aware source; Development posting remains Product-keyed |
| Balances / Valuation | BLOCKED — MD-014 | Legacy Product-only records prevent safe Variant-keyed cutover |
| Stock Opname | PARTIAL | Source workflow exists; end-to-end approval/posting/reconciliation tests pending |
| Dashboard | PARTIAL | Inventory/product surfaces exist; sales/receivables remain unavailable without authoritative modules |
| Settings | PARTIAL | Permission-aware navigation hub exists; system/company configuration and central audit viewer absent |
| Sales | NOT IMPLEMENTED | No Sales transaction tables; design decisions exist; blocked on Inventory Variant cutover |
| Returns | NOT IMPLEMENTED | No customer/supplier return transaction tables or posting RPCs |
| Accounting | NOT IMPLEMENTED | No chart of accounts, journals, fiscal periods, AR/AP or general ledger tables |
| Reports / Analytics | NOT IMPLEMENTED | Permissions exist; no dedicated validated reporting route/contracts |

## 4. Live Supabase Development snapshot — 2026-11-22

Project status: `ACTIVE_HEALTHY`, PostgreSQL `17.11`, region `ap-southeast-1`.

Read-only catalog query:
- 47 public base tables; all 47 have RLS enabled.
- 77 public functions; 44 are SECURITY DEFINER.
- 33 non-internal public triggers.
- 103 public RLS policies.
- 189 public indexes.
- The inspected Sales/Returns/Accounting transaction table set contains 0 of the 14 checked core tables.
- The applied migration ledger contains exactly 8 entries, latest `20261121050458 rbac_warehouse_scope_alignment`. MD-014 is not in the ledger.

### MD-014 null-Variant preflight

| Table | Rows | NULL `product_variant_id` |
|---|---:|---:|
| inventory_balances | 16 | 11 |
| inventory_movements | 9 | 9 |
| inventory_valuation_logs | 9 | 9 |
| product_units | 3 | 3 |
| purchase_order_items | 11 | 7 |
| stock_opname_items | 140 | 115 |
| **Total** | **188** | **154** |

154 of 188 rows lack Variant identity. This is a hard blocker. Do not infer a Variant from Product ID because one Product can have multiple Variants. MD-014 correctly fails closed while unresolved identities remain.

### Supabase security advisor
- 4 RLS-enabled tables have no policies: `import_indonesia_provinces`, `import_indonesia_regencies`, `sku_registry`, `user_deletion_requests`.
- 33 SECURITY DEFINER functions are executable by the `authenticated` role and require function-by-function intent/authorization review. This is not proof that every function is exploitable; it is an exposed privileged-function review queue.
- Existing migration history includes previous anon EXECUTE hardening; current findings are distinct authenticated-role findings.

### Supabase performance advisor
- Missing foreign-key covering-index recommendations remain open.
- 36 unused-index findings remain open. Do not drop indexes solely because the advisor labels them unused; inspect workload and duplicate-index overlap first.
- No index or schema changes were made during this audit.

## 5. Vercel deployment evidence

- Project: `hexa-core`.
- Latest Preview deployment: `dpl_Dmo3HdByqbbSQgSrVptTWb3ywfq3`.
- Deployment state: `READY`.
- Branch: `fix/engineering-governance-masterdata-consolidation-20261120`.
- Commit: `9dc9df91456a57b62b69318ea8d59c61ee79b6f0`.
- Preview URL: https://hexa-core-jem1ttu78-dawudsw0491-6310s-projects.vercel.app
- Earlier source-bearing Preview `dpl_AR5uxZFnhgdUK87FsPJK56yKwNDN` is recorded as passing Next.js compilation, TypeScript, and 58/58 static page generation. The latest deployment is READY but this audit did not independently rerun local lint or browser tests.

## 6. Critical blockers and risks

1. **MD-014 data reconciliation:** 154/188 rows have NULL Variant identity. Migration must not be applied to Development until an approved disposition/reconciliation exists.
2. **Source/live RPC mismatch:** source forms/actions use Variant IDs while live Development posting functions still use Product identity. Posting PO/GR, Movement, Transfer, and Opname is not validated as safe after the source port. Do not run operational posting against the current live schema as if Variant cutover were complete.
3. **Migration provenance drift:** live ledger has eight migrations; source has additional later migration files, including MD-014 and the optional IMEI path. Reconcile full migration chain against a clean local baseline before any remote rollout.
4. **Privileged function surface:** review 33 authenticated-executable SECURITY DEFINER functions; test permission checks, warehouse boundaries, and rollback behavior.
5. **RLS policy gaps:** resolve intended access for four RLS-enabled tables without policies.
6. **Performance backlog:** evaluate FK covering indexes and 36 unused-index findings with workload evidence.
7. **Verification gaps:** current evidence does not establish complete lint, authenticated browser role matrix, PO/GR/Movement/Transfer/Stock Opname end-to-end, rollback, or concurrent posting correctness.
8. **Sales, Returns, Accounting and Reports:** remain unimplemented. Do not create fake financial KPIs or placeholder transaction ledgers.

## 7. Next sequence — free/local-first

1. Preserve all committed work on the GitHub implementation branch; keep `master` untouched.
2. Enable Intel VT-x in ThinkPad BIOS and install/update WSL 2.
3. Install Docker Desktop using its free Personal terms where eligible, or a free Docker-compatible alternative. No paid Supabase Branch or other subscription is authorized.
4. Run local Supabase/PostgreSQL and replay the source migration chain in an isolated local environment.
5. Test MD-014 preflight, posting, valuation, partial IMEI, transfer, reversal, Stock Opname, ACL/RLS, and rollback locally.
6. Resolve all migration/source drift and create an evidence-backed remediation plan for the 154 legacy rows.
7. Only after review and explicit approval, consider changes to Supabase Development. Production remains out of scope.

## 8. Change log for this audit

- Read-only inspection of GitHub, Supabase Development, Supabase advisors, and Vercel.
- Added this audit document and refreshed the project status/backlog references.
- No Supabase schema/data changes, no Production changes, no Vercel environment changes, and no paid infrastructure were created.
