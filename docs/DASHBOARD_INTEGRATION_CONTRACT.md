# Dashboard Integration Contract

**Backlog ID:** DASH-005  
**Status:** Contract baseline — implementation alignment and runtime verification remain open  
**Source of truth:** Supabase/PostgreSQL for operational data; GitHub branch for application code and migrations  
**Branch:** `fix/engineering-governance-masterdata-consolidation-20261120`

## 1. Purpose and boundary

The Dashboard is a read-only consumer of authoritative module data. It must not become a second source of business truth, create shadow aggregates, or infer a transaction from a draft document.

A dashboard contribution is enabled only when its source table/RPC, transaction inclusion rule, permission/RLS scope, date rule, empty/error behavior, and navigation target are known and verifiable.

The contract does not create or imply implementation of Sales, Returns, Accounting, Receivables, Payables, or backup/uptime telemetry.

## 2. Mandatory rules for every contribution

1. **Authoritative source:** Read the owning module's table, view, or approved RPC. Do not calculate a business KPI from unrelated UI state or demo fixtures.
2. **Read-only:** Dashboard queries must not mutate operational data or bypass posting, approval, valuation, or reconciliation RPCs.
3. **Authorization:** Check the module permission with the authenticated user context. RLS remains active. Do not use the service-role client to make dashboard data visible.
4. **Warehouse scope:** Every warehouse-level count, amount, and activity item must be limited to warehouses the current user may access. A permission check alone is not a substitute for warehouse scope.
5. **Posting semantics:** Use the owning module's documented status rule. A draft or unposted transaction must not contribute to a posted operational/financial total. An activity feed may intentionally include non-draft workflow events, but must label them as workflow activity rather than posted ledger impact.
6. **No false zero:** Show zero only after a successful, authorized query confirms zero rows/value. Use an unavailable state for missing permission or an unimplemented source; show a query failure state for errors.
7. **Date and time:** Store/use database timestamps as authoritative instants. All Dashboard business-day boundaries and displayed timestamps must use the business timezone `Asia/Jakarta` explicitly. Do not rely on the hosting server's default timezone.
8. **Navigation:** Each actionable metric or feed item must lead to the owning module/document. Do not link an aggregate to an unrelated screen.
9. **Failure isolation:** An unavailable module must not make unrelated Dashboard sources look empty or healthy. Surface partial-source failures.
10. **Evidence:** A contribution is not DONE until its query, permission/RLS scope, business rule, local validation, authenticated runtime test, and dependent-module reconciliation are recorded.

## 3. Current integration register

| Contribution | Authoritative source | Inclusion / aggregation rule | Permission and scope | Empty / error rule | Navigation | Current state |
|---|---|---|---|---|---|---|
| Total Produk | RPC `get_product_statistics` | Uses the RPC's `total_products` result. Do not independently reconstruct the count in the page. The exact RPC definition and its source-controlled migration provenance still need reconciliation. | `master.view`; authenticated server context and database authorization remain active. | No permission: `—`. Query error: `Gagal dimuat`. A returned numeric zero is a real zero only when the RPC succeeds. | `/products` | Wired in Dashboard; definition/provenance and runtime permission checks remain open. |
| Total Persediaan (Available) | `inventory_balances.available_quantity` | Sum Available quantity over rows visible to the user. | `inventory.view` plus the live row-level warehouse restriction on `inventory_balances`. | No permission: `—`. Query failure: `Gagal dimuat`. | `/inventory/balances` | Wired; latest source passed local lint/build, runtime role/scope checks remain open. |
| Variant SKU Teridentifikasi | `inventory_balances.product_variant_id` | Count distinct non-null Product Variant IDs among visible balance rows. Do not substitute parent Product ID for missing Variant identity. | Same visible balance rows under `inventory.view` and warehouse RLS scope. | Do not treat a failed balance query as zero. | `/inventory/balances` | Source aligned in Dashboard and Inventory Overview; runtime/reconciliation checks remain open. |\n| Saldo Legacy tanpa Variant | `inventory_balances.product_variant_id IS NULL` | Count unresolved Product-only balance rows separately; do not merge them into SKU count or guess a Variant. | Same visible balance rows under `inventory.view` and warehouse RLS scope. | Show unavailable/error when balance query fails; zero is valid only after successful authorized read. | `/inventory/balances` | Source aligned; rows remain unresolved until approved reconciliation. |
| Total On Hand | `inventory_balances.on_hand_quantity` | Sum On Hand across all status buckets. Do not substitute Available quantity. | `inventory.view` and warehouse RLS scope. | Same unavailable/error behavior as Inventory Overview. | `/inventory/balances` | Wired; reconcile against Stock Balances for the same user and warehouse scope. |
| Nilai Persediaan | `inventory_balances.inventory_value` | Sum the persisted inventory value for the visible balance rows. Do not recompute valuation in the Dashboard. | `inventory.view` and warehouse RLS scope. | Same unavailable/error behavior as Inventory Overview. | `/inventory/balances` | Wired; valuation reconciliation remains open. |
| Gudang Aktif | `warehouses` | Exact count where `is_active = true`. | `master.view` because the live warehouse SELECT policy is tied to master permission. | Without permission or if reference query fails, show unavailable/error; never infer zero from hidden rows. | `/warehouses` when permitted; otherwise balances fallback. | Wired; role-based runtime check remains open. |
| Varian Produk Aktif | `product_variants` | Exact count where `is_active = true`. | `master.view` because the live product-variant SELECT policy is tied to master permission. | Without permission or if reference query fails, show unavailable/error. | `/products` | Wired as a supporting Inventory Overview count; runtime check remains open. |
| Posted Movement Count | `inventory_movements` | Count rows with `status = 'posted'`. | `inventory.view` plus explicit `has_warehouse_access(warehouse_id)` filtering. If the scope check fails, the count is unavailable. | Failed scope/query check must not render zero. Zero is valid only when authorized scope is verified and no posted rows exist. | `/inventory/movements` | Wired; warehouse-role runtime check remains open. |
| Purchase Order activity | `purchase_orders` | Activity feed includes non-draft records (`status <> 'draft'`), ordered by `updated_at`. This is workflow activity, not posted inventory or financial value. | `purchasing.view` plus `has_warehouse_access(warehouse_id)`. | Source query failure is listed in the feed warning. No accessible rows is distinct from no permission and from query failure. | `/purchases/[id]` | Wired in latest-10 feed; role/warehouse browser verification remains open. |
| Goods Receipt activity | `goods_receipts` | Only `status = 'posted'` and non-null `posted_at`; ordered by `posted_at`. | `goods_receipt.view` plus `has_warehouse_access(warehouse_id)`. | Source query failure is listed in the feed warning. Never include draft/unposted receipts as posted activity. | `/purchases/[purchase_order_id]/goods-receipts/[id]` | Wired in latest-10 feed; end-to-end receipt verification remains open. |
| Inventory Movement activity | `inventory_movements` | Only `status = 'posted'` and non-null `posted_at`; ordered by `posted_at`. | `inventory.view` plus explicit `has_warehouse_access(warehouse_id)`; do not rely solely on the currently observed permission-only movement SELECT policy. | Source or warehouse-scope failure is surfaced; failed scope checks fail closed. | `/inventory/movements` | Wired in latest-10 feed; role/warehouse browser verification remains open. |
| Server response | Current authenticated Dashboard server request | Showing `Merespons` means this request reached Dashboard server rendering. It is not a separate host uptime/SLA probe. | Dashboard access required. | A failed Dashboard request cannot render this status. | N/A | Wired; label must not be represented as 24/7 uptime. |
| Database connectivity | Read-only lookup of the signed-in user's own `user_profiles.id` | Database is `Terhubung` only when the query succeeds and returns the expected user ID. | Authenticated user context; no service-role bypass. | Distinguish `Gagal` from `Tidak terverifikasi`. | N/A | Wired; authenticated runtime test remains open. |
| Backup timestamp | No verified backup scheduler/telemetry source identified | No value may be inferred from database timestamps or deployment activity. | Infrastructure evidence required. | `Tidak tersedia` until a reliable backup source is integrated. | N/A | Not implemented. |
| Uptime | No verified process/host uptime telemetry source identified | Do not derive uptime from app start time, request time, or deployment timestamp. | Infrastructure telemetry required. | `Tidak tersedia` until a reliable uptime source is integrated. | N/A | Not implemented. |

## 4. Explicitly deferred module contributions

The current route/project evidence classifies Sales, Returns, and Accounting as not implemented. The live schema inspection recorded in the shared project status also found no transaction tables for those modules at that inspection point.

Therefore:

- **Penjualan Hari Ini:** unavailable until an authoritative Sales posting source, amount definition, business date boundary, and permission/RLS contract exist.
- **Piutang:** unavailable until an authoritative customer receivable ledger/source and posting/reversal rules exist.
- **Returns:** no return counts or amounts until return lifecycle and inventory/accounting effects are implemented and verified.
- **Accounting / Payables:** no balances, profit, cash, or payable KPI until the accounting ledger/source and reconciliation rules exist.
- Customer and Supplier master CRUD does not by itself authorize sales, receivables, payables, or purchasing financial KPIs.
- User/RBAC is a security and visibility dependency for all contributions, not a substitute source for operational business KPIs.

Do not display fabricated zeros, sample events, or derived estimates for deferred contributions.

## 5. Timezone and date-boundary requirement

Use `Asia/Jakarta` explicitly for all display formatting and for any future "today", "this month", aging, and period KPI boundaries. Date-boundary filters must be defined as a half-open interval in the business timezone and converted consistently to the database timestamp type.

**Implementation update:** the activity formatter now sets `timeZone: "Asia/Jakarta"` explicitly in commit `2c0384a`. This removes reliance on the deployment host timezone for displayed activity timestamps. Local lint/build and an authenticated browser check with a timestamp close to the UTC/Jakarta date boundary are still required. Future date-bound KPI queries must also calculate their half-open date interval in `Asia/Jakarta`; changing display formatting alone does not define a database query boundary.

## 6. Required module delivery template

Every future module must add a row to this contract before wiring its Dashboard contribution:

| Field | Required decision |
|---|---|
| Module and contribution | Exact KPI, activity event, alert, or status label |
| Source of truth | Exact table/view/RPC and authoritative amount/quantity fields |
| Inclusion rule | Status, posting, reversal, cancellation, and effective-date behavior |
| Authorization | Permission key, RLS policy, ownership/warehouse scope |
| Time | Timestamp column, business timezone, period boundary |
| Aggregation | Formula, unit/currency, rounding, deduplication rule |
| Empty/error/loading | Unauthorized, true zero, no source, query error, partial-source error |
| Navigation | Exact module route or source document route |
| Verification | Local lint/build, authenticated role matrix, business-flow test, reconciliation evidence |

## 7. Definition of DONE for DASH-005

- Current Dashboard contributions match the register above.
- The timezone alignment gap is resolved and covered by a deterministic test.
- Each wired source is verified with authenticated role/warehouse combinations.
- Zero, unavailable, and query failure states are demonstrated separately.
- Deferred modules remain unavailable until their source modules and ledger semantics are verified.
- Backlog evidence records the exact commit and test results.

This document defines the Dashboard integration contract. It does not declare all rows runtime-verified or mark DASH-005 DONE.
