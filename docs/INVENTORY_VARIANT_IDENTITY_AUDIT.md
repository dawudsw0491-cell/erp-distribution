# Inventory Variant Identity Audit

**Backlog:** MD-014  
**Environment:** Supabase Development project `erp-distribution-dev` (`vwxzlvsigxeopibnfuhp`)  
**Implementation branch:** `fix/engineering-governance-masterdata-consolidation-20261120`  
**Audit date:** 2026-11-21  
**Mode:** Read-only source and live-schema inspection. No database writes, migration application, or data updates were performed.

## 1. Executive finding

The inventory implementation does not have one consistent stock identity model.

Three incompatible layers are present:

1. **Original source migration set (26, 29, 33–35, 44, 45–49):** movement, balance, transfer, reversal, and stock-opname logic are designed around `product_variant_id`; migration 29 defines the balance key as `(product_variant_id, warehouse_id)`.
2. **Later source migrations (57–59):** Goods Receipt, movement creation/posting, transfer helper, and mixed-IMEI Stock Opname functions were rewritten around `product_id`. Migration 59 explicitly restores the balance conflict key to `(product_id, warehouse_id)`.
3. **Live Development database:** the active balance constraint is `uq_inventory_balance_product_warehouse(product_id, warehouse_id)`; the live posting RPC reads/writes by `product_id + warehouse_id`. The live migration ledger contains only eight entries through `20261121050458`; migrations 57–59 are not in that ledger.

The later product-level functions are not merely a legacy data issue. They are active source definitions that contradict the original variant-level model. Therefore, changing only the live unique constraint or only one RPC would leave other transaction paths inconsistent.

## 2. Source evidence

| Area | Variant-oriented source | Later product-oriented source / concern |
|---|---|---|
| Movement table | `database/26_create_inventory_movements.sql` requires `product_variant_id` | Migration 59 adds/replaces product-level movement creation and posting using `product_id` |
| Balance | `database/29_create_inventory_balances.sql` requires variant ID and unique variant + warehouse | Migration 59 inserts/upserts and selects balances by product + warehouse |
| Posting / valuation | `database/33_inventory_posting_functions.sql` reads the Product through Product Variant and posts variant-keyed balances/logs | Migration 59 replaces `post_inventory_movement_unlocked` with product-keyed balance and valuation writes |
| Transfer | `database/34_inventory_transfer_function.sql` and `database/44_create_inventory_transfer_draft_function.sql` use Product Variant IDs | Migration 57 adds `create_inventory_transfer_by_product` and product-keyed balance/unit lookups |
| Reversal | `database/35_inventory_reversal_function.sql` validates and reverses by Product Variant | Must be checked against the active live reversal function and product-keyed movement/valuation rows before any migration |
| Stock Opname | `database/45`–`48` snapshot and post by Product Variant | Migration 58 rewrites start/reconcile/post flows around Product ID and joins balances by Product ID |
| Goods Receipt | Earlier transaction path depends on PO item/product variant relationships | Migration 57 posts receipt quantities using Product ID and can register identified units without canonical variant balance identity |
| UI/server actions | `app/inventory/movements/actions.ts` sends `p_product_id`; `app/inventory/transfers/actions.ts` sends `p_product_id` | Current UI contract is product-level, despite the product setup requirement that stock belongs to immutable Variant SKU |

## 3. Live Development evidence

Read-only catalog inspection returned:

- `inventory_balances.product_id` is nullable and has FK `fk_inventory_balances_product_id`.
- `inventory_balances.product_variant_id` is also nullable and has an FK to `product_variants`.
- The active unique constraint is `uq_inventory_balance_product_warehouse(product_id, warehouse_id)`.
- `inventory_movements`, `inventory_valuation_logs`, and `product_units` contain both nullable `product_id` and nullable `product_variant_id` columns.
- The live `post_inventory_movement_unlocked(uuid,numeric)` definition requires `product_id`, selects `products.tracking_type`, creates/locks the balance by `product_id + warehouse_id`, updates the product-level balance, and writes product-level valuation logs.
- The live `post_inventory_transfer(uuid)` is a wrapper around `post_inventory_transfer_unlocked`; the latter must be treated as part of the live posting path and inspected before replacement.
- The live migration ledger has eight entries through `20261121050458 rbac_warehouse_scope_alignment`; it does not include migrations 57, 58, or 59.

### Live balance snapshot

At audit time, `inventory_balances` contained 16 rows across 14 products and 2 warehouses:

- 11 rows had `product_variant_id IS NULL`.
- 5 rows had `product_variant_id IS NOT NULL`.
- Some balances have non-zero on-hand quantities and valuation while variant identity is NULL.
- Example: product `IPH-15-256-WHT` has a variant-linked balance of 9 units in one warehouse and a separate product-only balance of 1 unit in another warehouse.
- Example: products `HXA-000002`, `HXA-000003`, and `HXA-000004` are IMEI-tracked and have product-only balances and product-only unit/movement records.
- Movement and unit snapshots show existing posted history where `product_variant_id` is NULL.

These records prove that a blanket assignment of each legacy balance to a variant is not justified by the balance row alone. A product may have multiple variants, and a historical product-only movement/unit does not identify which SKU variant it represents.

## 4. Consequences

- Sales Order soft reservation cannot be correctly computed per SKU while stock is aggregated at Product level.
- Delivery Order posting cannot safely consume a specific Variant SKU balance.
- A migration that merely makes `product_variant_id` NOT NULL would fail or force fabricated variant assignments.
- A migration that retains product-level balances but adds a parallel variant ledger would create dual sources of truth and reconciliation risk.
- A posting RPC update without coordinated Goods Receipt, transfer, reversal, stock-opname, IMEI, valuation, dashboard, and UI changes would create mixed semantics.

## 5. Required implementation sequence

### Phase A — Finish read-only dependency inventory

1. Inspect all active live RPC definitions, including `post_inventory_transfer_unlocked`, Goods Receipt posting, reversal, Stock Opname, movement creation, and helper functions.
2. Inspect all source migrations and identify the last definition of every overloaded/replaced function in migration order.
3. Trace all application queries, server actions, dashboards, views, triggers, and RLS policies that read/write the balance or movement identity.
4. Build a reconciliation matrix for every historical balance, movement, valuation log, and serialized unit. Preserve unresolved records as unresolved; do not infer variants from product labels, row order, or test fixtures.

### Phase B — Decide the canonical transition contract

The accepted product model requires each Variant SKU to own its own stock identity. The target contract should therefore be:

- `inventory_balances`: one row per `(product_variant_id, warehouse_id)`.
- `inventory_movements`: canonical `product_variant_id`; retain product ID only if needed as a denormalized, validated compatibility field.
- `inventory_valuation_logs`: valuation keyed to the same variant and warehouse as its movement.
- `product_units`: every identified IMEI/Serial unit references a canonical Product Variant.
- Goods Receipt, movement, transfer, reversal, and Stock Opname all post through the same variant-level identity.
- Aggregate IMEI remainder is SKU/variant aggregate stock with NULL `product_unit_id`, not product-level aggregate stock.

Do not implement this target by changing only a table constraint. Every posting path and read path must move together.

### Phase C — Non-destructive legacy treatment

Classify historical records into:

1. **Provable variant mapping:** a trusted source document or serialized identifier establishes the exact variant.
2. **Ambiguous product-only balance/history:** multiple variants exist or no reliable source link proves the variant.
3. **Zero-balance historical row:** no quantity/value remains, but audit history and FK dependencies still require preservation.
4. **Already variant-linked record:** identity is explicit and can be retained after integrity checks.

Only category 1 can be migrated automatically. Categories 2 and 3 must be retained in a documented legacy/unresolved treatment until an approved business reconciliation resolves them. No balances, movement rows, valuation logs, or unit identities may be reassigned or deleted as part of this audit.

### Phase D — Validation gates

- Reconcile opening quantity and value by warehouse and variant against posted movement/valuation history.
- Verify no negative status buckets, no duplicated balance keys, and no cross-variant transfer.
- Test quantity products, IMEI products with identified and aggregate remainder, and Serial products.
- Test Goods Receipt, manual movement, transfer, reversal, Stock Opname, and dashboard reads.
- Test transaction rollback, concurrent posting, permissions, RLS, and warehouse boundaries.
- Replay the complete migration chain against a clean Development baseline and reconcile migration provenance before considering Production.

## 6. Explicitly not done

- No SQL migration was applied.
- No live RPC or table was altered.
- No inventory balance, movement, valuation, or unit record was updated, deleted, or reassigned.
- No Sales schema or Delivery Order posting was implemented.
- No Production resource was accessed or changed.

## 7. Current status

**MD-014 remains P0 / BLOCKING.** The investigation confirms the mismatch spans source migrations, live database functions, UI action contracts, and historical data. The next implementation unit is a complete function and query dependency map plus a non-destructive data classification—not a schema migration.


## 8. Follow-up dependency map — live functions, UI, RLS and triggers

A second read-only pass inspected the active live RPC catalog, RLS policies, foreign keys, triggers, and current application query contracts.

### 8.1 Live RPC inventory

The live Development database exposes both product-level and variant-level overloads:

- Variant-level creation functions exist: `create_inventory_movement(p_product_variant_id, ...)` and `create_inventory_transfer(p_product_variant_id, ...)`.
- Product-level creation functions also exist: `create_inventory_movement_by_product(p_product_id, ...)` and `create_inventory_transfer_by_product(p_product_id, ...)`.
- The active live `post_inventory_transfer_unlocked(uuid)` validates `product_id`, locks/upserts balances with `ON CONFLICT (product_id, warehouse_id)`, and calculates transfer valuation at Product level.
- The active live `post_inventory_reversal_unlocked(uuid, uuid)` validates original/reversal identity by `product_id`, locks the balance by Product ID, and writes valuation rows containing both nullable product and variant fields.
- The active live `post_goods_receipt_by_product(uuid)` reads the PO item Product ID and creates product-level movement/unit records.
- The active live `post_stock_opname_unlocked(uuid)` posts by `product_id` and uses `ON CONFLICT (product_id, warehouse_id)`.
- The active live `create_inventory_movement_by_product` and `create_inventory_transfer_by_product` are `SECURITY DEFINER` functions. The variant-level counterparts are also `SECURITY DEFINER`. Function exposure/grants and permission enforcement must be reviewed as part of the transition; this audit did not alter grants or function security.

The coexistence of these overloads is a concrete source of ambiguity: callers can select different identity contracts based on function name/signature even though they operate on the same balance table.

### 8.2 Application read/write contract map

| Application surface | Current source contract | Consequence |
|---|---|---|
| `app/inventory/balances/page.tsx` | Selects `inventory_balances` by `product_id`, filters non-null Product ID, aggregates product-level balances | Product-level UI contract |
| `app/inventory/page.tsx` | Selects `product_variant_id` from balances, and joins variant records | Variant-level read contract; may omit product-only balances |
| `app/inventory/movements/actions.ts` and page | Form/action uses `product_id`; movement list joins Products by Product ID | Product-level movement contract |
| `app/inventory/transfers/actions.ts` and page | Form/action uses `product_id`; transfer matching compares Product IDs | Product-level transfer contract |
| `app/inventory/opname/[id]/page.tsx` | Stock Opname items and unit matching use Product ID; UI includes aggregate IMEI count | Product-level Opname contract |
| `app/inventory/units/page.tsx` | Unit list queries `product_id` and Product relation | Product-level unit display contract |
| `app/inventory/stock-balance-realtime.tsx` | Subscribes to `inventory_balances` and `product_units` | Realtime refresh is table-based; it does not itself reconcile identity |
| `app/purchases/[id]/goods-receipts/[receiptId]/page.tsx` | Goods Receipt display follows PO item Product relation | Display does not prove posting is variant-safe |
| `docs/DASHBOARD_INTEGRATION_CONTRACT.md` | KPI contract uses Product ID with Variant ID fallback for SKU count; inventory values from balances | Dashboard semantics must be redefined against one canonical identity |

The Inventory overview and Stock Balances pages currently have different identity contracts. This can create mismatched totals even before any Sales module is added.

### 8.3 RLS and triggers

- `inventory_balances` SELECT policy checks `inventory.view` and `has_warehouse_access(warehouse_id)`.
- `inventory_movements` SELECT policy checks `inventory.view OR is_owner()` plus warehouse access.
- `inventory_valuation_logs` SELECT policy checks `inventory.view OR is_owner()` but the observed policy does not include an explicit warehouse-scope predicate. This is a separate security-review item; do not silently change it as part of the identity migration.
- `product_units` SELECT policy includes permission and nullable warehouse-scope handling.
- Stock Opname session/item/unit-count policies derive access from warehouse scope.
- Warehouse-scope enforcement triggers are present on balances, movements, units, goods receipts, and Stock Opname tables. Catalog output showed repeated trigger entries with the same trigger name/table/action; exact event/timing duplication should be checked against `pg_trigger` before proposing cleanup.
- Valuation logs have multiple update/delete protection triggers in the live catalog. Do not drop or consolidate without identifying which functions are active and proving append-only behavior remains enforced.

### 8.4 Foreign key and nullability finding

Live schema retains both nullable `product_id` and nullable `product_variant_id` foreign keys across balances, movements, valuation logs, units, and Stock Opname items. The database therefore permits records without a canonical identity and does not enforce that Product ID matches the Product referenced by Product Variant ID.

This must be addressed through validated constraints and transition logic, not by assuming the two columns are interchangeable.

## 9. Updated implementation boundary

MD-014 must produce a single identity transition design covering:
- all live function overloads and execute grants;
- application reads and writes on Inventory overview, balances, movements, transfers, units, Stock Opname and dashboard;
- RLS and warehouse-scope behavior;
- trigger timing/events and duplicate protections;
- all FKs, nullability, and cross-column Product/Variant consistency;
- legacy balance, movement, valuation and unit classification.

No application-side partial fix should switch only one page or action to Variant ID while the corresponding live posting function still writes Product ID.
