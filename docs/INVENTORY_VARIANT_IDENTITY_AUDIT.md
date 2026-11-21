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


## 10. Trigger event and function ACL verification

The previous information-schema trigger listing repeated rows for multi-event triggers. A direct `pg_trigger` inspection confirms there are **not duplicate trigger objects** for those repeated rows; the same trigger was represented once per event by the earlier catalog view.

Verified active trigger definitions include:

- Warehouse-scope enforcement on balances, movements, product units, Goods Receipts, and Stock Opname records.
- Inventory movement update/delete guards and posted timestamp trigger.
- Valuation insert guard, validation trigger, and two distinct update/delete protection triggers (`guard_inventory_valuation_change` and `prevent_inventory_valuation_log_change`). These are separate objects and must both be understood before any cleanup.
- Product unit tracking validation on insert/update of `product_variant_id`.

Function ACL inspection confirms:

- Authenticated can execute the public-facing movement and transfer creation functions, Goods Receipt posting, Inventory Movement posting wrapper, Inventory Transfer posting wrapper, and Inventory Reversal wrapper.
- The `*_unlocked` posting functions are not granted to authenticated; their ACL is limited to postgres/service_role in the inspected state.
- This is materially safer than the earlier generic concern that all SECURITY DEFINER functions may be callable by every role. The exact ACL must be preserved and rechecked after any future function replacement.

## 11. Record-level legacy classification status

The aggregate snapshot is sufficient to prove ambiguity exists but not sufficient to map every record. The next read-only reconciliation query must enumerate the exact primary keys and source-document references for each balance, movement, valuation log, and product unit, then determine whether a trusted upstream PO/GR/identifier/document establishes a Variant ID.

No record-level reassignment is justified from Product ID alone where the Product has multiple variants. No trigger duplication cleanup is indicated by the verified `pg_trigger` catalog.


## 12. First record-level provenance test — Goods Receipt → Purchase Order Variant

A read-only join was tested from Product-only inventory movements with `source_reference_type = 'goods_receipt'` through:

`inventory_movements.source_reference_id → goods_receipts.id → goods_receipt_items → purchase_order_items.product_variant_id → product_variants`.

Results:

- The `IPH-15-256-WHT` Goods Receipt movement for quantity 10 links to PO item `e43edccb-fe79-4cef-a941-bde372d0f75b`, which explicitly references Variant SKU `IPH-15-256` (Variant ID `0e067953-7b23-4747-bff5-6f74ed2f52e2`).
- The related posted transfer pair moves quantity 1 from the source warehouse to another warehouse and shares the same movement group/source reference. The source movement and PO receipt provide a plausible trace for both sides of this transfer; the receiving balance has quantity 1 while the source variant balance has quantity 9. This is a strong candidate for a provable variant mapping, but before migration the full movement-group integrity and valuation sequence must be checked.
- The three IMEI products `HXA-000002`, `HXA-000003`, and `HXA-000004` have Goods Receipt → PO item links, but their PO items currently have `product_variant_id IS NULL`. The receipt link therefore does not establish a Variant ID.
- `TEST-HEXA-001` also has a Product-only receipt/PO link with a NULL PO Variant ID. Do not infer a variant from its product label or treat it as a production-grade example.
- The Goods Receipt provenance path is not a universal resolver. It can only establish a variant where the PO item itself has a non-null, valid Product Variant and the receipt/movement relationship is unique and quantity-consistent.

No records were changed. The IPH-15-256 case is classified as **candidate provable mapping — pending transfer/valuation cross-check**. HXA-000002/003/004 and TEST-HEXA-001 remain **unresolved at the Variant identity level** based on the evidence retrieved so far.


## 13. Transfer and valuation cross-check — provenance candidate rejected

A further read-only reconciliation checked the exact movement group, valuation entries, PO item identity, Variant parent Product, and serialized-unit links.

### 13.1 IPH-15-256-WHT transfer group

The posted transfer group is `1e071c07-2558-47eb-b8bf-67a58c4a7c1e`:

| Movement | Warehouse | Quantity delta | Status | Product Variant |
|---|---|---:|---|---|
| `59dcf90a-9bb5-4ff9-81c3-052cf2064bbc` — transfer_out | GUDANG JAKPUS | -1 | posted | NULL |
| `e448ab47-1545-47ff-9341-83bef0fb487b` — transfer_in | GUDANG TESTING | +1 | posted | NULL |

Both legs share the same group ID, source transfer ID `1e071c07-2558-47eb-b8bf-67a58c4a7c1e`, reference number `TRF-1E071C072558`, Product ID, and posting timestamp window. The pair is quantity-balanced.

### 13.2 Valuation chronology

Three valuation rows are linked to the receipt and transfer movements:

| Transaction | Quantity before → after | Value before → after | Average cost |
|---|---:|---:|---:|
| Purchase +10 | 0 → 10 | Rp0 → Rp12,500,000 | Rp1,250,000 |
| Transfer out -1 | 10 → 9 | Rp12,500,000 → Rp11,250,000 | Rp1,250,000 |
| Transfer in +1 | 0 → 1 | Rp0 → Rp1,250,000 | Rp1,250,000 |

The transfer valuation is internally consistent: the source reduces one unit and Rp1,250,000; destination receives one unit at the same cost. All three valuation rows have `product_variant_id IS NULL`.

### 13.3 Critical PO Product / Variant referential mismatch

The receipt item links to PO item `e43edccb-fe79-4cef-a941-bde372d0f75b`:
- PO item Product ID = `a18a7dd1-3db1-4c35-a6ce-2505d12e1adf` (`IPH-15-256-WHT`).
- PO item Product Variant ID = `0e067953-7b23-4747-bff5-6f74ed2f52e2` (Variant SKU `IPH-15-256`).
- That Product Variant's own parent Product ID is `511c2c29-c4ba-43a5-9a90-58aae612a0e1` (`TEST-IPHONE-001`), **not** the PO item's Product ID.

The database therefore contains a cross-product identity mismatch in the upstream PO item. Although the PO item has a non-null Variant ID, it does not belong to the same Product. This invalidates the prior candidate mapping. The receipt movement, transfer pair, and valuation chronology are internally quantity/value-consistent but do not prove the correct Variant identity.

**Classification correction:** IPH-15-256-WHT is **ambiguous / identity-conflicted**, not provable. Do not assign Variant SKU `IPH-15-256` to its balance, movements, valuation, or units without business/source-document reconciliation. This finding also demonstrates why a future database constraint must validate `product_variant_id → product_id` consistency, not merely non-nullness.

### 13.4 Serialized IMEI unit trace

The current serialized-unit query returns three unit records:
- HXA-000002 — IMEI `356938035643809`
- HXA-000003 — IMEI `352099001761481`
- HXA-000004 — IMEI `490154203237518`

Each unit has `product_variant_id IS NULL`. Their Goods Receipt-linked PO items also have `product_variant_id IS NULL`. Therefore none can be assigned to a Variant SKU from the available PO/GR provenance.

HXA-000002 additionally has a posted transfer-out/in pair linked through the same `product_unit_id`; the unit remains represented by one unit row, while the movement history records its warehouse transfer. This does not supply missing Variant identity.

The unit-to-GR join can produce multiple PO item candidates if it joins all receipt items for a receipt and Product; a safe future resolver must join through the exact Goods Receipt Item / PO Item relationship for the specific unit creation event, not infer from a broad receipt-level join.

### 13.5 Product-only balance snapshot — unresolved rows

The live Development query returned 10 rows with `product_variant_id IS NULL`:

| Product SKU | Warehouse | On hand | Inventory value | Classification |
|---|---|---:|---:|---|
| HXA-000001 | GUDANG JAKPUS | 0 | Rp0 | Zero-balance historical |
| HXA-000002 | GUDANG JAKPUS | 0 | Rp0 | Zero-balance historical |
| HXA-000002 | GUDANG TESTING | 1 | Rp1,850,000 | Ambiguous product-only |
| HXA-000003 | GUDANG JAKPUS | 1 | Rp1,250,000 | Ambiguous product-only |
| HXA-000004 | GUDANG JAKPUS | 1 | Rp4,850,000 | Ambiguous product-only |
| IPH-15-256-WHT | GUDANG TESTING | 1 | Rp1,250,000 | Ambiguous / PO Product-Variant conflict |
| PRD-8C9F56BBF9D44657A0341DA9F1375A57 | GUDANG JAKPUS | 0 | Rp0 | Zero-balance historical |
| SAM-FOLD-128-BLK | GUDANG JAKPUS | 0 | Rp0 | Zero-balance historical |
| SS-FOLD-128GB-BLK | GUDANG JAKPUS | 0 | Rp0 | Zero-balance historical |
| TEST-HEXA-001 | GUDANG JAKPUS | 1 | Rp1,020,000.26 | Ambiguous product-only; test-labelled record, not auto-discarded |

The zero-balance classification applies only to the balance row at the time of inspection; it does not mean its movement/valuation history can be deleted. The table is a live snapshot, not an approved cleanup list.

### 13.6 Updated disposition

- IPH-15-256-WHT: provenance candidate rejected due to PO Product/Variant parent mismatch.
- HXA-000002/003/004: serialized units and active balances remain ambiguous; upstream PO Variant IDs are NULL.
- TEST-HEXA-001: remains ambiguous despite test-like naming; no deletion or reassignment.
- Five product-only balances shown above have zero quantity and zero value; preserve historical references pending dependency analysis.
- Transfer quantity and valuation arithmetic for the IPH group reconcile, but identity does not.
- No variant mapping is currently approved by this evidence.

No database records, constraints, functions, triggers, or grants were changed. MD-014 remains P0 / BLOCKING.


## 14. Purchase Order Product ↔ Variant parent consistency scan

A read-only scan of all PO items with non-null `product_variant_id` compared:
`purchase_order_items.product_id` against `product_variants.product_id`.

The Development database returned **4 PO item rows with cross-Product Variant references**:

| PO item ID | PO Product SKU | Referenced Variant SKU | Variant parent Product SKU |
|---|---|---|---|
| `b8bb71be-c22b-48a2-a72d-fb5293ad1a58` | IPH-15-256-WHT | IPH-15-256 | TEST-IPHONE-001 |
| `e43edccb-fe79-4cef-a941-bde372d0f75b` | IPH-15-256-WHT | IPH-15-256 | TEST-IPHONE-001 |
| `e81cf049-d6db-4e58-9059-865c8e1e1ab8` | IPH-256-PUR | PURPLE | TEST-IPHONE-001 |
| `b940e9a0-a101-478e-ab52-5a10ca942461` | SS-FOLD-128GB-WHT | WHITE | SS-FOLD-128GB-BLK |

All four rows violate the expected Product/Variant parent relationship. This is broader than one receipt: the PO layer itself contains cross-Product references. It is not safe to use PO `product_variant_id` as a migration resolver until these references are reconciled.

### Required implication

Before identity migration, validate every upstream document line carrying both Product ID and Variant ID—not only PO items. At minimum, inspect Purchase Order items, Goods Receipt items through their PO item, Stock Opname items, transfer/movement source documents, and any Sales/return document lines if present. Add a future database-level consistency guard only after existing invalid rows are classified and corrected under an approved plan.

No rows were modified. The four PO mismatches are evidence for reconciliation, not an automatic correction list.


## 15. Extended Product ↔ Variant consistency scan — live Development

The scan covered all live public tables with both `product_id` and `product_variant_id`:

- `inventory_balances`
- `inventory_movements`
- `inventory_valuation_logs`
- `product_units`
- `product_variant_attribute_values`
- `purchase_order_items`
- `stock_opname_items`

### 15.1 Stock Opname — posted session contains 25 cross-Product rows

Session `OPN-20261112-3C43CE0A` is **posted**, with 25 items. All 25 items have a Product ID that differs from the referenced Variant's parent Product ID. The rows are grouped into five mismatched Product/Variant pairs, five rows each:

| Opname Product SKU | Variant SKU | Variant parent Product SKU | Rows | Snapshot / Count / Variance |
|---|---|---|---:|---:|
| IPH-128-BLK | BLACK | TEST-IPHONE-001 | 5 | 0 / 0 / 0 |
| IPH-15-128-WHT | IPH-15-128 | TEST-IPHONE-001 | 5 | 0 / 0 / 0 |
| IPH-15-256-WHT | IPH-15-256 | TEST-IPHONE-001 | 5 | 0 / 0 / 0 |
| IPH-256-PUR | PURPLE | TEST-IPHONE-001 | 5 | 0 / 0 / 0 |
| SS-FOLD-128GB-WHT | WHITE | SS-FOLD-128GB-BLK | 5 | 0 / 0 / 0 |

All 25 mismatched rows have zero snapshot, counted, and variance quantities. The session is nevertheless posted, so these are persistent posted-document identity defects, not merely draft data.

Other sessions in the inspected Development state:
- `OPN-20261112-455A6DF3`: cancelled, 50 items, no Product/Variant parent mismatches.
- `OPN-20261117-BC59544D`: posted, 65 items, no Product/Variant parent mismatches.
- `OPN-20261117-191357D5`: draft, 0 items.

Do not delete or rewrite the 25 posted rows solely because their quantities are zero. Their posted session and audit history remain relevant.

### 15.2 Inventory balances — five non-null Variant IDs are cross-Product

The live `inventory_balances` table has 16 rows:
- 11 rows with `product_variant_id IS NULL`.
- 5 rows with non-null Variant IDs; **all five** have a Product ID that differs from the Variant's parent Product ID.

| Balance Product SKU | Variant SKU | Variant parent Product SKU | On hand | Inventory value |
|---|---|---|---:|---:|
| IPH-128-BLK | BLACK | TEST-IPHONE-001 | 0 | Rp0 |
| IPH-15-128-WHT | IPH-15-128 | TEST-IPHONE-001 | 0 | Rp0 |
| IPH-15-256-WHT | IPH-15-256 | TEST-IPHONE-001 | 9 | Rp11,250,000 |
| IPH-256-PUR | PURPLE | TEST-IPHONE-001 | 0 | Rp0 |
| SS-FOLD-128GB-WHT | WHITE | SS-FOLD-128GB-BLK | 0 | Rp0 |

The IPH-15-256-WHT balance is especially critical: it contains 9 Units and Rp11,250,000, but its non-null Variant ID points to a Variant belonging to TEST-IPHONE-001. This row must not be treated as a valid variant-level balance. Its quantity/value must remain preserved while the intended identity is resolved from authoritative business documents.

### 15.3 Movement, valuation and serialized units

Current live counts:
- `inventory_movements`: 9 rows; all 9 have NULL Variant ID.
- `inventory_valuation_logs`: 9 rows; all 9 have NULL Variant ID.
- `product_units`: 3 rows; all 3 have NULL Variant ID.
- The scan found no non-null cross-Product Variant rows in these three tables because their Variant IDs are all NULL. This is absence of identity, not proof of correct identity.

The nine movements and nine valuation rows were individually enumerated in the read-only query. They comprise the IPH-15-256-WHT receipt/transfer chain, HXA-000002/003/004 Goods Receipt movements, HXA-000002 transfer pair, and TEST-HEXA-001 receipt.

### 15.4 Variant attribute values

`product_variant_attribute_values` contains 74 rows. All 74 have a non-null Product ID matching the referenced Variant's parent Product ID. No cross-Product mismatch or null Product ID was found in this table.

This table is not an inventory ledger, but its consistency confirms that the parent mismatch is concentrated in transaction/inventory document data rather than every Product/Variant relationship table.

### 15.5 Revised severity and transition boundary

The defect is now confirmed in three live transaction/inventory layers:
1. Purchase Order items: 4 cross-Product rows.
2. Posted Stock Opname: 25 cross-Product rows in one posted session.
3. Inventory balances: 5 cross-Product rows, including one active balance with 9 Units / Rp11,250,000.

Inventory movements, valuation logs, and serialized units instead have missing Variant IDs throughout their inspected rowsets.

The next transition design must explicitly separate:
- **Invalid non-null Variant references** — retain the row and value; require authoritative remapping decision.
- **NULL Variant identity** — do not infer from Product ID or descriptive SKU text alone.
- **Zero-balance / zero-quantity posted history** — retain for audit; no automatic deletion.
- **Valid Variant parent relationships** — preserve unchanged.

No database rows or schema objects were modified. MD-014 remains P0 / BLOCKING; Sales implementation remains blocked.


## 16. Goods Receipt unit-level lineage and transfer source-table check

### 16.1 IMEI provenance is exact at receipt-item level, but Variant remains unknown

The Goods Receipt unit tables provide a more precise lineage than a broad receipt-level join:

`goods_receipt_units.goods_receipt_item_id → goods_receipt_items.id → purchase_order_item_id → purchase_order_items`

For GR `GR-20261117-78177A18`, the exact item/unit links are:

| Product SKU | Goods Receipt Item ID | PO Item ID | IMEI / Unit Code | PO Variant |
|---|---|---|---|---|
| HXA-000002 | `633445cf-8629-41a2-a85d-8954ab9c0409` | `0901e39f-7b42-48eb-af56-57b9d47c7b25` | `356938035643809` | NULL |
| HXA-000003 | `a1a5797b-5f30-4084-af3e-b81396870110` | `b9da2445-56e2-4c7f-8e67-154f206f932d` | `352099001761481` | NULL |
| HXA-000004 | `68838bac-05b3-4ab2-9961-6fc49c2c0c0c` | `0fd5d717-33f9-4fd0-afb4-6e9205c0566d` | `490154203237518` | NULL |

Each Goods Receipt item has quantity 1 and exactly one Goods Receipt unit identifier. The exact chain confirms which PO line each IMEI came from, but the source PO lines have no Variant ID. Thus the three serialized units are **precisely traced but still Variant-unresolved**.

### 16.2 IPH receipt line retains invalid upstream Variant reference

GR `GR-20261116-C6BB0763` item `bc7c044b-91c4-4d14-9f87-3d631d46f34f` receives quantity 10 at Rp1,250,000 each from PO item `e43edccb-fe79-4cef-a941-bde372d0f75b`. The PO line references Variant SKU `IPH-15-256`, whose parent Product remains `TEST-IPHONE-001`, not `IPH-15-256-WHT`. The exact receipt-item join confirms the bad reference is inherited from the PO; it does not resolve the correct variant.

GR `GR-20261120-2770CA9C` for `TEST-HEXA-001` similarly has a PO item with NULL Variant ID; no Variant can be inferred.

### 16.3 Transfer header/line table discovery

A catalog scan for public base tables with names containing `transfer` returned no rows in this Development database. The inspected transfer history is currently exposed through Product-only `inventory_movements` with `source_reference_type = 'stock_transfer'`, source reference IDs, and movement groups. There is no separate public transfer header/line table available to validate through this catalog query.

This absence is a schema observation, not proof that no transfer record exists in another schema or external service. Any transition design must use the actual current movement provenance and should not invent a transfer-header FK.

### 16.4 Updated source lineage disposition

- HXA-000002/003/004: exact PO/GR/IMEI line lineage confirmed; Variant remains NULL and unresolved.
- IPH-15-256-WHT: exact GR→PO lineage confirmed; PO's non-null Variant is cross-Product and invalid as a resolver.
- TEST-HEXA-001: exact GR→PO lineage confirmed; Variant remains NULL.
- Transfer references: only movement-level source reference and group evidence found in public transfer-named base-table scan.

No records were changed.
