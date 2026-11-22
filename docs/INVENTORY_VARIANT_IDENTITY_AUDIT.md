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
| UI/server actions (initial audit snapshot) | At the initial audit, movement and transfer actions sent `p_product_id`. | This was the original defect; the current branch has since ported these create actions to Variant IDs. The live database posting RPCs remain Product-keyed until MD-014 is safely applied. |

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

| Application surface | Current source contract on implementation branch | Live Development / residual limitation |
|---|---|---|
| `app/inventory/balances/page.tsx` | Reads balance rows by `product_variant_id`; displays Variant SKU and parent Product name. | Live legacy rows with NULL Variant identity remain unresolved and are not assigned to a SKU. |
| `app/inventory/page.tsx` and `app/page.tsx` | SKU KPI counts distinct non-null `product_variant_id`; Product-only balance rows are counted separately as unresolved legacy rows. | Dashboard is source-aligned, but totals still include legacy balance rows in quantity/value metrics until the approved data disposition. |
| `app/inventory/movements/actions.ts` and page | Create action sends `p_product_variant_id`; history displays Variant SKU where identity exists and labels legacy Product-only history explicitly. | Live posting RPC remains Product-keyed until MD-014 migration is applied and verified. |
| `app/inventory/transfers/actions.ts` and page | Draft creation sends Variant ID; history validates the paired movement Variant IDs and displays Variant SKU. Drafts without a Variant are not postable in the UI. | Live transfer posting RPC remains Product-keyed; do not post operational transfers until MD-014 is applied and verified. |
| `app/inventory/opname/[id]/page.tsx` | Snapshot/count UI uses Variant identity; serialized unit matching is Variant-scoped; aggregate IMEI count excludes serialized units. | Existing NULL Variant items remain legacy/unresolved; migration preflight blocks. |
| `app/inventory/units/page.tsx` | Serialized unit registry joins Product Variant and displays Variant SKU. | Legacy Product Units with NULL Variant remain unresolved. |
| `app/purchases/[id]/page.tsx` | PO detail displays Variant SKU/name; legacy lines without Variant are labelled. | Live PO item records still include NULL Variant IDs; migration preflight blocks. |
| `app/purchases/actions.ts` and PO form | Source action submits `product_variant_id` to Variant-level PO/GR RPC contracts. | These RPC definitions are in the unapplied MD-014 migration; live runtime is not yet enabled. |
| `docs/DASHBOARD_INTEGRATION_CONTRACT.md` | SKU count is based only on distinct `product_variant_id`; unresolved Product-only balance rows are shown separately. | Dashboard contract is updated; authenticated runtime and warehouse-scope reconciliation remain open. |

The implementation branch now uses Variant identity across the primary Inventory and Purchasing source surfaces. This does not change the live Development database: Product-only records and Product-keyed posting RPCs remain until MD-014 passes reconciliation and is safely applied.

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


## 17. Non-destructive transition proposal — DRAFT, NOT APPROVED

This section is a design proposal only. It is not an implementation instruction and does not authorize DDL, RPC replacement, data updates, migration application, or Production changes.

### 17.1 Target identity contract

- Product Variant is the canonical stock identity.
- Every inventory balance, movement, valuation entry, Stock Opname item, and serialized unit must resolve to one Product Variant when the business item is variant-managed.
- Product ID must equal the parent Product ID of the referenced Product Variant.
- IMEI/unit identifier remains optional for aggregate stock. If present, it identifies an individual serialized unit but does not replace Variant SKU identity.
- Product-only legacy rows must remain explicitly classified as unresolved until authoritative source evidence determines a mapping. Product ID or descriptive SKU text alone is not sufficient evidence.

### 17.2 Data safety classes

| Class | Current evidence | Proposed handling |
|---|---|---|
| Valid Product/Variant parent match | 74/74 variant attribute value rows passed; other valid references must be rechecked by table | Preserve unchanged |
| Cross-Product non-null Variant | 4 PO lines, 25 posted Opname items, 5 balance rows | Quarantine from automatic mapping; require source-document/business resolution |
| NULL Variant with active stock/value | 5 product-only balance rows from earlier snapshot; movement/valuation/unit records also NULL | Preserve quantity/value and history; require explicit mapping evidence |
| NULL Variant with zero balance | 5 balance rows from earlier snapshot | Retain historical rows; no deletion based only on zero balance |
| Exact IMEI/GR/PO trace but PO Variant NULL | HXA-000002/003/004 | Preserve IMEI trace; Variant remains unresolved until source documents or authorized product master decision are supplied |

### 17.3 Proposed remediation phases

**Phase A — Freeze and baseline**
1. Capture a timestamped Development snapshot of balances, movements, valuation logs, product units, PO items, GR items/units, and Stock Opname items.
2. Export primary keys and source-document links into a reconciliation register.
3. Record row counts, per-warehouse quantity/value totals, and hashes or equivalent immutable evidence.
4. No data writes in this phase.

**Phase B — Authoritative identity resolution**
1. Resolve each cross-Product PO reference against the approved product catalogue and source purchase documents.
2. Resolve the 25 posted Stock Opname references. Their zero quantities do not waive the posted-document audit requirement.
3. Resolve the five non-null cross-Product balance rows, especially IPH-15-256-WHT's 9 Units / Rp11,250,000.
4. Resolve Product-only active stock and serialized units from authoritative documents; do not infer from Product labels or IMEI format.
5. Produce a signed-off mapping register with old identity, intended Product ID, intended Variant ID, evidence, approver, and affected downstream rows. Any unresolved record remains in a legacy/unresolved bucket.

**Phase C — Source contract correction**
1. Make PO item writes validate Variant parent Product before saving.
2. Make Goods Receipt inherit the exact PO item identity and reject invalid Product/Variant pairs.
3. Make Stock Opname creation/posting validate the same parent relationship.
4. Make all Inventory posting RPCs accept and validate Variant identity for variant-managed stock.
5. Ensure transfer legs preserve the same Variant ID; serialized unit transfer must preserve the same unit and Variant identity.
6. Preserve existing permission checks, warehouse-scope enforcement, SECURITY DEFINER boundaries, and exact EXECUTE ACLs.
7. Align all application reads and writes, including Inventory overview, balances, movements, transfers, units, Stock Opname, GR, and dashboard, in one coordinated release.

**Phase D — Backfill and cutover (only after explicit approval)**
1. Create reviewed, idempotent migration scripts with preconditions and postconditions.
2. Apply corrections only from the approved mapping register; no blanket update by Product ID.
3. Preserve original source references and append an auditable reconciliation record for each changed identity.
4. Introduce constraints only after invalid existing rows are remediated or explicitly retained in a compatible legacy model.
5. Replace product-level uniqueness with canonical Variant/Warehouse uniqueness only after all readers and posting writers are ready for the cutover.
6. Do not merge or discard legacy balance rows until quantity, reserved quantity, status buckets, inventory value, average cost, and valuation chronology reconcile per warehouse and Variant.

**Phase E — Validation**
- Product/Variant parent mismatch count = 0 for all enforced tables.
- No active variant-managed stock remains without a resolved Variant ID.
- No posted movement or valuation row is silently lost or duplicated.
- Per-warehouse total on-hand, reserved, quarantine, damaged, repair, and inventory value reconcile before/after.
- Average cost per Variant/Warehouse reconciles to the approved valuation method.
- Every serialized unit maps to one Product Variant and at most one active warehouse state.
- GR, transfer, reversal, Stock Opname, and unit tracking business flows pass.
- RLS, warehouse scope, function ACL, trigger protections, and direct-write restrictions are revalidated.
- Application pages and dashboard display the same canonical stock totals.
- Preview deployment READY and smoke tests pass before any Production consideration.

### 17.4 Rollback design requirements

- Preserve a pre-migration snapshot and explicit mapping ledger.
- Use additive migration steps where possible; do not drop old identity columns or legacy support until the new path has passed a defined observation period.
- Any rollback must restore the previous read/write contract and reconcile balances from immutable movement/valuation evidence, not merely reverse a column update.
- Define a stop condition for any mismatch in row counts, stock quantities, values, valuation chronology, or warehouse scope.
- Production rollback and execution require separate explicit authorization.

### 17.5 Unresolved decisions / approval gates

1. Business owner must confirm the correct Product/Variant identity for all cross-Product PO, Opname, and balance rows.
2. Decide whether unresolved historical Product-only rows remain in a legacy archive/read-only ledger or are mapped after documentary approval.
3. Confirm whether the existing Product records are intentionally separate sellable items or should be consolidated into one parent Product with variants. This cannot be inferred from labels alone.
4. Confirm how historical posted Stock Opname rows with invalid Variant references should be represented without rewriting audit history.
5. Approve the exact migration/cutover/rollback plan before any schema or data write.

**Current status:** design draft only. No schema/data change has been authorized or executed. MD-014 remains P0 / BLOCKING and SALES-001 remains blocked.


## 18. Approved test-data disposition — RESET SELECTED, EXECUTION NOT AUTHORIZED

**Decision recorded 2026-11-21:** The user confirmed that all data currently entered into the application is test data and selected **reset** as the intended disposition for MD-014. This changes the remediation strategy: the project does not need to preserve or individually remap defective test transactions as business history. It does not change the canonical schema target or remove the need to understand dependencies.

**Authorization boundary:** This is a planning decision only. It does not authorize deletion, truncation, table drops, schema changes, migration application, RPC/RLS/trigger changes, or any Production action. No reset has been executed. A separate explicit approval is required after the exact target environment, reset scope, dependency order, backup/restore point, and post-reset seed plan are presented.

### 18.1 Reset principle and preservation boundary

- Rebuild the Development test dataset from a clean, documented baseline after the canonical schema and posting contracts are implemented and validated.
- Do not carry forward test transaction history merely to repair its invalid Product/Variant references.
- Do not use a broad schema reset or indiscriminate TRUNCATE as the reset method.
- Preserve schema objects, migration ledger/provenance, constraints, indexes, RPCs, triggers, RLS policies, grants, and deployment configuration unless a separately reviewed implementation change explicitly modifies them.
- Preserve required bootstrap/security data and system configuration: owner/admin access path, roles, permissions, role-permission mappings, warehouse access model, and essential reference/configuration rows. Exact table-level classification remains a prerequisite; do not assume every master/config row is safe to preserve.
- Product/catalog master rows created only for testing may be reset and reseeded from the approved canonical catalog. Do not delete master data until dependencies and required seed records are identified.
- Keep Development and Production strictly separated. Production is out of scope and must not be queried for reset execution or modified.

### 18.2 Reset scope classification and dependency matrix

The matrix is a planning inventory, not a deletion script. Actual FK graph, cascade behavior, triggers, RPC side effects, and all dependent tables must be re-queried from the current Development schema immediately before an approved reset.

| Domain / data class | Known objects / examples | Intended disposition | Dependency / ordering requirement |
|---|---|---|---|
| Purchasing transactions | `purchase_orders`, `purchase_order_items` | Reset test rows | Before GR and inventory descendants only where FK graph requires; inspect status/audit references and child tables |
| Goods Receipt | `goods_receipts`, `goods_receipt_items`, `goods_receipt_units` | Reset test rows | After dependent inventory movements, valuation and units, or use a verified dependency-safe order |
| Inventory ledger | `inventory_movements`, `inventory_valuation_logs`, `inventory_balances` | Reset all test rows and rebuild balances from fresh postings | Movements/valuation/unit references must be handled before balances; never independently zero balances while retaining ledger rows |
| Serialized tracking | `product_units`, GR unit identifiers | Reset test units | Resolve references from GR, movement, transfer and Opname records first; IMEI remains optional in the target model |
| Stock Opname | `stock_opnames`, `stock_opname_items` and related count rows | Reset test sessions and detail rows | Child count rows before session headers if FK requires; confirm actual table names and FK graph |
| Transfers | Movement rows with `source_reference_type='stock_transfer'`; no public transfer-named base table was found in the earlier scan | Reset test transfer history as part of inventory ledger | Trace source references and movement groups; do not invent a transfer header table |
| Sales / returns | No authoritative Sales transaction implementation is currently accepted; Sales remains blocked | No assumed reset target until current schema inventory confirms objects | Must remain blocked until inventory identity contract is complete |
| Product/catalog master | Products, variants, categories, brands, attributes, attribute values, barcodes, warranty templates | Classify test-created rows for reset; reseed only approved canonical master data | Reset child/association rows before parent masters; preserve required system/reference seeds; validate SKU/variant FK dependencies |
| Warehouses and locations | Warehouse master and user-warehouse access links | Preserve required canonical warehouses/configuration; remove test-only locations only after access dependencies are mapped | Preserve valid security scope and required default warehouse references |
| Identity and authorization | Auth users, user profiles, roles, permissions, role assignments, role-permission links | Preserve bootstrap access and security configuration by default | Never bulk-delete auth/security rows as part of transaction reset; validate owner recovery before any account cleanup |
| System/configuration/reference data | Settings, numbering sequences, templates, feature/config rows | Preserve required system configuration; reset only explicitly classified test fixtures | Identify which values are runtime-critical and which are generated test fixtures |
| Audit / event / logs | Audit trails, activity events, outbox/notification rows if present | Classify separately; retain security/audit evidence unless approved policy says otherwise | Inspect FK retention and external side effects; deleting source rows may not delete external events |
| Storage objects | Product/document attachments if present | Classify and clean only with matching DB reference plan | DB row cleanup and object deletion are separate operations; no orphan/bulk storage deletion without inventory |

### 18.3 Required reset dependency discovery

Before writing a reset plan or SQL, perform a read-only, current-state discovery of:

1. All tables in exposed and relevant private schemas, row counts, primary keys, foreign keys, FK delete actions, and dependency graph.
2. Triggers on candidate tables, including trigger functions and whether they write to other tables or external systems.
3. RPC/function definitions that create, post, reverse, or delete transactional records; identify side effects and SECURITY DEFINER execution boundaries.
4. RLS policies and grants affecting reset visibility/execution; do not weaken them to make reset easier.
5. Storage buckets and object references, if any test transactions own uploaded files.
6. Current migration ledger versus repository migrations; a data reset must not rewrite or erase migration provenance.
7. Required bootstrap user and authorization recovery path, including confirmation that an Owner can still log in after the reset.
8. Canonical seed set for warehouses, product/catalog master, warranty templates, roles, permissions and other required reference data.

### 18.4 Revised MD-014 sequence

**Phase A — Freeze and baseline (read-only)**
- Re-query current Development row counts and key relationships; previous snapshots are historical evidence and must not be treated as current counts.
- Capture export/backup or an approved restore point before any reset; record timestamp, environment ref, table coverage and restore verification.
- Produce an explicit table-by-table KEEP / RESET / RESEED / REVIEW register with reason and dependency order.
- No writes.

**Phase B — Canonical source/schema contract**
- Complete Product Variant stock identity across balances, movements, valuation, units, Goods Receipt, transfers, reversals and Stock Opname.
- Correct PO/GR/Opname and application contracts so all writers validate Product ID against Variant parent Product ID.
- Preserve permissions, warehouse scope, RLS, SECURITY DEFINER boundaries and exact EXECUTE ACLs.
- Keep Sales implementation blocked until Inventory identity is stable.

**Phase C — Clean Development baseline design**
- Define canonical seed data and required bootstrap/security/configuration rows.
- Build a dependency-ordered reset manifest from the verified FK/trigger/function graph.
- Prefer a controlled, idempotent reset procedure scoped to approved Development test records; avoid blanket table truncation and CASCADE unless individually justified.
- Define preconditions, abort conditions, transaction boundaries, expected row counts, and post-reset assertions.

**Phase D — Explicit reset approval gate**
- Present exact project/environment, table list, KEEP/RESET/RESEED classifications, expected impact, backup/restore plan, and execution sequence.
- Obtain explicit user approval for the reset operation itself. The prior selection of "reset" is not approval to execute any database write.

**Phase E — Execute only after approval**
- Execute only against the confirmed Development project.
- Verify clean transaction tables, retained Owner access/security configuration, preserved migration ledger, canonical master seeds, and zero orphan references.
- Record exact migration/script commit, execution evidence and before/after counts.
- Do not touch Production.

**Phase F — Rebuild and validate**
- Recreate approved master/catalog fixtures, then run controlled PO → GR → Inventory, optional IMEI, transfer, reversal and Stock Opname tests.
- Verify variant-level quantity/value/average cost by warehouse, parent consistency, RLS, warehouse scope, ACLs and rollback behavior.
- Only then unblock dependent Sales design/implementation.

### 18.5 Reset stop conditions

Stop without writing if any of the following is true:
- Environment identity is not conclusively Development.
- Owner/admin recovery cannot be demonstrated.
- FK/cascade/trigger side effects are incomplete or unknown.
- A candidate table mixes system/security records with test fixtures and cannot be safely separated.
- Backup/restore point is unavailable or unverified.
- Migration ledger/source provenance is at risk.
- Reset would affect Production, shared external storage, or external integrations outside the approved scope.

**Current state:** Reset disposition selected; reset manifest and dependency discovery are pending. No data, schema, migration, RPC, RLS, trigger, ACL, or Production changes have been performed.


## 19. Current Development reset dependency inspection — 2026-11-21

This is a read-only inspection performed after the user requested to proceed with the selected test-data reset. No data or schema writes were executed.

### 19.1 Environment and migration baseline

- Confirmed project: `erp-distribution-dev`, project ref `vwxzlvsigxeopibnfuhp`, region `ap-southeast-1`, status `ACTIVE_HEALTHY`.
- Confirmed migration ledger: 8 entries, latest `20261121050458 rbac_warehouse_scope_alignment`.
- The migration ledger is infrastructure/provenance and is explicitly outside the reset scope.
- The catalog contains Supabase-managed schemas (`auth`, `storage`, `realtime`, `vault`, `extensions`) in addition to `public`. Reset must not target these managed schemas wholesale.
- `storage.buckets` returned zero rows at inspection time; no Storage bucket cleanup is currently indicated.

### 19.2 Exact row counts observed for reset-sensitive and protected tables

Counts are current query results from this inspection, not estimates:

| Table | Rows | Initial classification |
|---|---:|---|
| `auth.users` | 1 | KEEP — bootstrap identity |
| `public.user_profiles` | 1 | KEEP — Owner profile |
| `public.user_roles` | 1 | KEEP — preserve Owner assignment |
| `public.roles` | 7 | KEEP / REVIEW — authorization master |
| `public.permissions` | 39 | KEEP — authorization master |
| `public.role_permissions` | 100 | KEEP — authorization mapping |
| `public.user_warehouse_access` | 0 | KEEP schema/configuration; no rows |
| `public.warehouses` | 2 | REVIEW — preserve until canonical warehouse decision |
| `public.purchase_orders` | 7 | RESET candidate |
| `public.purchase_order_items` | 11 | RESET candidate |
| `public.goods_receipts` | 3 | RESET candidate |
| `public.goods_receipt_items` | 5 | RESET candidate |
| `public.goods_receipt_units` | 3 | RESET candidate |
| `public.goods_receipt_unit_identifiers` | 3 | RESET candidate |
| `public.inventory_movements` | 9 | RESET candidate; guarded |
| `public.inventory_valuation_logs` | 9 | RESET candidate; guarded |
| `public.inventory_balances` | 16 | RESET candidate; rebuild from postings |
| `public.product_units` | 3 | RESET candidate |
| `public.stock_opname_sessions` | 4 | RESET candidate |
| `public.stock_opname_items` | 140 | RESET candidate |
| `public.stock_opname_unit_counts` | 3 | RESET candidate |
| `public.user_audit_logs` | 6 | REVIEW — not ordinary test transaction data |
| `public.products` | 31 | REVIEW / RESEED |
| `public.product_variants` | 23 | REVIEW / RESEED |
| `public.sku_registry` | 54 | REVIEW — synchronized by Product/Variant triggers |
| `public.suppliers` | 1 | REVIEW / RESEED |
| `public.product_variant_attribute_values` | 50 | REVIEW / RESEED — master associations |
| `public.role_permissions` | 100 | KEEP — not business test data |

The table list also includes product/category/attribute/model, customer, supplier-contact/address/bank-account, and Indonesia geographic reference tables. These must be individually classified; do not assume all are transactional or safe to delete.

### 19.3 Critical dependency and guard findings

- Goods Receipt descendants have restrictive FK relationships: `goods_receipt_unit_identifiers → goods_receipt_units → goods_receipt_items → goods_receipts`. Receipt items also reference PO items.
- Inventory movements reference Product Units, Product Variants, Warehouses, Auth users, and can self-reference reversals. Movement deletion is protected by `trg_guard_inventory_movement_delete`.
- Valuation logs reference inventory movements and have two distinct UPDATE/DELETE protection triggers: `trg_guard_inventory_valuation_update_delete` and `trg_prevent_valuation_log_update_delete`. Their functions must be reviewed before proposing any authorized bypass or cleanup path.
- Product Unit identifiers reference Product Units with RESTRICT behavior; Product Units reference Product Variant and Warehouse.
- Stock Opname items reference sessions and may reference Product Variant and Auth users; unit counts reference Opname items. Child-first order is required.
- Product/Variant deletion is restricted by product-variant attribute values, Product Variant links, inventory, and other master associations.
- Product and Product Variant changes invoke SECURITY DEFINER SKU registry synchronization triggers. Product/Variant reset must account for `sku_registry` and must not leave stale or duplicate SKU registry entries.
- Purchase Order and Goods Receipt rows reference Auth users and warehouse/supplier masters. Preserve the bootstrap user, warehouses and supplier/master references until the reset/reseed manifest explicitly resolves them.
- No separate public transfer header/line table appeared in the earlier catalog scan; transfer history is represented by inventory movement references/groups.

### 19.4 Reset execution status and blockers

**Reset is NOT EXECUTED.** The inspection confirms that a naive DELETE/TRUNCATE is unsafe:
- Movement and valuation deletion guards are active.
- Several FK edges are RESTRICT.
- The single Owner/Auth account and security configuration must be preserved.
- Warehouse, supplier, Product master, SKU registry, and audit-log rows need an explicit KEEP/RESET/RESEED decision.
- No backup/restore artifact or restore verification has yet been established in this workstream.
- The trigger/function dependency inventory is not yet complete enough to issue a safe reset script.

The user’s instruction to proceed is recorded as approval to advance MD-014 reset preparation. It is not treated as approval for an unspecified whole-database destructive operation. A final execution approval must identify the exact Development project, table scope, order, backup/restore point and expected retained records.

No DDL, DML, migration application, RPC, RLS, trigger, ACL or Production change was performed in this inspection.

## 20. Reset preparation — complete public-table inventory, guards and backup evidence

**Inspection date:** 2026-11-21  
**Environment:** Development only (erp-distribution-dev, project ref vwxzlvsigxeopibnfuhp)  
**Mode:** Read-only. No DDL, DML, migration, RPC, trigger, ACL, RLS, or Production operation was performed.

### 20.1 Exact current public-table counts

A fresh count query was executed against all 46 ordinary tables in schema public. These counts supersede earlier estimates and are a point-in-time snapshot.

| Table | Rows | Preliminary disposition | Reason / condition |
|---|---:|---|---|
| brands | 8 | REVIEW / RESEED | Catalog master; decide canonical seed set |
| category_attribute_templates | 0 | KEEP schema; no row action | Empty structural/configuration table |
| connection_test | 1 | RESET candidate | Test-only table; verify no operational dependency before clearing row |
| customers | 1 | REVIEW / RESEED | Master/business record; not assumed test-only from count |
| goods_receipt_items | 5 | RESET | Test transaction detail; FK child of GR and PO item |
| goods_receipt_unit_identifiers | 3 | RESET | Child identifiers; delete before GR units |
| goods_receipt_units | 3 | RESET | Serialized GR unit rows; delete after identifiers |
| goods_receipts | 3 | RESET | Test GR headers; delete after GR items |
| import_indonesia_provinces | 0 | KEEP schema; no row action | Empty import/staging table |
| import_indonesia_regencies | 0 | KEEP schema; no row action | Empty import/staging table |
| indonesia_districts | 7,285 | KEEP | Geographic reference data |
| indonesia_provinces | 38 | KEEP | Geographic reference data |
| indonesia_regencies | 514 | KEEP | Geographic reference data |
| indonesia_villages | 83,762 | KEEP | Geographic reference data |
| inventory_balances | 16 | RESET / REBUILD | Derived stock snapshot; rebuild only from canonical posted postings after identity contract passes |
| inventory_movements | 9 | RESET candidate — guarded | Test transaction ledger; DELETE trigger rejects all direct deletes |
| inventory_valuation_logs | 9 | RESET candidate — guarded | Append-only/immutable ledger; two independent DELETE/UPDATE guards |
| permissions | 39 | KEEP | Authorization master |
| product_attribute_assignments | 70 | REVIEW / RESEED | Product-to-attribute master association; depends on canonical catalog seed |
| product_attribute_values | 16 | REVIEW / RESEED | Attribute value master; preserve/reseed canonical allowed values |
| product_attributes | 5 | REVIEW / RESEED | Attribute definitions; preserve/reseed canonical definitions |
| product_categories | 15 | REVIEW / RESEED | Category hierarchy; preserve/reseed canonical hierarchy |
| product_models | 2 | REVIEW / RESEED | Product model master; verify canonical references |
| product_suppliers | 0 | KEEP schema; no row action | Empty association table |
| product_unit_identifiers | 3 | RESET candidate | Serialized unit identifier children; delete before Product Units |
| product_units | 3 | RESET candidate | Test serialized inventory units; referenced by movement/opname records |
| product_variant_attribute_values | 74 | REVIEW / RESEED | All 74 current rows passed Product/Variant parent consistency; canonical catalog mapping must be regenerated |
| product_variants | 23 | REVIEW / RESEED | Variant SKU identity master; coordinate with Products and SKU registry triggers |
| products | 31 | REVIEW / RESEED | Product master; only reset after dependent records/associations are classified |
| purchase_order_items | 11 | RESET | Test PO detail; GR items must be cleared first |
| purchase_orders | 7 | RESET | Test PO headers; GR references must be cleared first |
| role_permissions | 100 | KEEP | Authorization mapping |
| roles | 7 | KEEP / REVIEW | Preserve role definitions and Owner/bootstrap access |
| sku_registry | 54 | DERIVED — RECONCILE | Do not clear independently; Product/Variant SKU triggers maintain this registry |
| stock_opname_items | 140 | RESET candidate — guarded dependencies | Test Opname detail; clear unit-count children first |
| stock_opname_sessions | 4 | RESET candidate | Test Opname headers; clear all items first |
| stock_opname_unit_counts | 3 | RESET candidate | Child rows; also reference Product Units |
| supplier_addresses | 2 | REVIEW / RESEED | Supplier master child; contains geographic FK references |
| supplier_bank_accounts | 0 | KEEP schema; no row action | Empty supplier master child |
| supplier_contacts | 0 | KEEP schema; no row action | Empty supplier master child |
| suppliers | 3 | REVIEW / RESEED | Supplier master; count differs from earlier snapshot, preserve pending explicit classification |
| user_audit_logs | 6 | KEEP | Preserve security/audit evidence unless separate retention approval |
| user_deletion_requests | 1 | KEEP / SECURITY REVIEW | User/security workflow record; do not treat as generic demo data |
| user_profiles | 1 | KEEP | Bootstrap Owner profile |
| user_roles | 1 | KEEP | Bootstrap Owner role assignment |
| user_warehouse_access | 0 | KEEP schema; no row action | Authorization/scope table |
| warehouses | 2 | KEEP / REVIEW | Preserve warehouse identity and access model until canonical warehouse decision |

The earlier shorthand that one supplier exists is stale: the latest exact count is 3 suppliers. The current exact product_variant_attribute_values count is 74, confirming the earlier detailed audit count.

### 20.2 Protected Supabase-managed schemas and identity

The reset scope is limited to explicitly classified application data in public. It does not include wholesale reset, truncate, or deletion of auth, storage, realtime, vault, extensions, system catalogs, or migration ledger objects.

The bootstrap identity remains protected:
- auth.users: 1 row — KEEP.
- public.user_profiles: 1 row — KEEP.
- public.user_roles: 1 row — KEEP.
- Roles, permissions, role-permission mappings and warehouse access model — KEEP.

No Storage buckets were present in the prior inspection. This does not authorize modifying Storage schema or its managed metadata.

### 20.3 FK graph and candidate child-first dependency order

The current public schema has 90 foreign-key constraints. The principal reset dependencies are:

1. Goods Receipt descendants: goods_receipt_unit_identifiers → goods_receipt_units → goods_receipt_items → goods_receipts; GR items also reference PO items.
2. Purchase Orders: purchase_order_items → purchase_orders; Goods Receipt headers reference PO headers.
3. Stock Opname: stock_opname_unit_counts → stock_opname_items → stock_opname_sessions; unit counts also reference Product Units.
4. Serialized inventory: product_unit_identifiers → product_units; Inventory Movements also reference Product Units.
5. Inventory valuation and movement: inventory_valuation_logs → inventory_movements; movement rows have a self-reference through reversal_of_id. Any approved reset must handle this graph and its guards.
6. Catalog dependencies: product_variant_attribute_values references Product Variant, Product Attribute Value, Product Attribute Assignment and Product Attribute; Product Attribute Assignments reference Products and Attributes; Product Variants reference Products; Products reference Model, Brand and Category; Product Models reference Brands.
7. SKU registry: Product and Product Variant BEFORE INSERT/UPDATE/DELETE triggers synchronize sku_registry. A catalog reset must account for these side effects and validate the resulting registry; do not independently clear registry rows.
8. Supplier graph: Supplier contacts, addresses and bank accounts reference Suppliers; Supplier Addresses also reference Indonesia geographic reference tables. Keep geographic parents.
9. Authorization graph: Role Permissions reference Roles and Permissions; User Roles reference Auth Users and Roles; user profiles/warehouse access are protected.

This is a dependency map, not an executable deletion order. The final manifest must be generated from the full FK graph and actual row relationships, including all remaining constraints, not just the summarized chains above.

### 20.4 Trigger and function guard findings

The latest direct pg_trigger inspection confirms:

- inventory_movements has a BEFORE DELETE trigger trg_guard_inventory_movement_delete; its function always raises an exception and explicitly requires draft cancellation or posted reversal instead of direct deletion.
- inventory_movements also has an UPDATE guard. Its body must be included in the final reset-method review.
- inventory_valuation_logs has two distinct BEFORE UPDATE OR DELETE guards. Both functions unconditionally reject mutation and describe the valuation log as append-only/immutable. There is no safe basis for assuming either guard can be bypassed.
- inventory_valuation_logs also has insert validation/guard triggers.
- private.enforce_warehouse_scope() is attached to multiple transaction and inventory tables. Its body has a service-role branch, but it is not a generic reset authorization contract and does not override the movement/valuation immutability guards.
- Product and Product Variant BEFORE INSERT/UPDATE/DELETE triggers call SECURITY DEFINER sync_sku_registry(). Deleting a catalog row has a side effect that deletes its corresponding registry entry; a catalog reset must account for transaction rollback and registry consistency.
- validate_product_unit_tracking() requires a Product or Variant-linked tracked Product Unit and only permits IMEI/Serial tracking types.
- No trigger was disabled, replaced, dropped, or bypassed.

**Reset implication:** A direct DELETE plan for movement/valuation ledgers will fail by design. Do not disable triggers, change their functions, or use an undocumented bypass. The reset design must either use a supported project-level Development restore/reseed workflow with verified recovery, or propose a separately reviewed and explicitly approved controlled reset mechanism whose audit/security impact is documented. The current inspection does not authorize either method.

### 20.5 Backup and recovery evidence

Read-only PostgreSQL settings show:
- PostgreSQL version: 17.11.
- archive_mode = on.
- wal_level = logical.
- WAL archive command is configured through the provider's WAL-G/admin manager.
- pg_stat_archiver: 955 archived WAL files, 0 failures; most recent archived WAL timestamp returned as 2026-11-21 14:16:23.61709+00.

This proves WAL archiving is configured and has recently succeeded. It does not prove a specific restorable base backup exists, prove the required point-in-time recovery window, or prove a restore drill succeeded. No backup artifact, restore point ID, backup timestamp, or restore test was independently verified in this pass.

**Backup gate remains BLOCKED:** before any reset, confirm in Supabase Dashboard/provider backup controls that a usable backup or PITR point covers the exact pre-reset state; record the timestamp/identifier and retention window; and verify a restore path or isolated restore test. Do not represent WAL archive statistics as proof of a complete backup.

### 20.6 Preliminary disposition and reset boundary

The current reset scope is deliberately split:

- RESET candidates: application-entered PO/GR/Inventory/Stock Opname test transactions and their dependent rows, plus the single connection_test row after confirming it is disposable.
- REBUILD: inventory_balances must be regenerated from canonical variant-level postings, not preserved as the current product-keyed derived balance.
- REVIEW / RESEED: Products, Variants, SKU registry, product attributes/values/assignments, categories, brands, models, Suppliers and Customers. The exact canonical seed set and any legitimate records must be approved before reset.
- KEEP: bootstrap Auth/Owner identity, authorization tables and mappings, warehouses pending canonical decision, audit logs, deletion-request/security records, and Indonesia geographic reference tables.
- KEEP schema / no row action: empty staging/configuration tables.

No exact destructive manifest is approved yet. Before requesting execution approval, remaining work is to:
1. enumerate and inspect every public FK edge not covered by the principal chains above, including actual referencing rows;
2. inspect all reset-relevant trigger function bodies and every RPC that could mutate these ledgers or cascade side effects;
3. determine whether provider backup/PITR is available and identify a concrete restorable point;
4. settle the catalog KEEP/RESET/RESEED list and canonical seed content;
5. produce a manifest with exact table scope, row predicates/expected counts, dependency order, transaction/restore boundaries, preconditions, and abort assertions;
6. request approval for that exact manifest before any destructive action.

**Status remains:** MD-014 P0 / BLOCKING. This section records read-only findings only. No DDL/DML, migration, RPC, trigger, ACL, RLS, or Production operation was performed.


## 21. Reset-relevant RPC and immutable-ledger function review

A read-only definition and ACL review covered the currently active product-oriented movement/transfer, Goods Receipt, Stock Opname posting functions, inventory movement update guard, valuation insert validation, serialized identifier validation, and SKU registry synchronization.

### 21.1 Movement lifecycle guard

The live guard on Inventory Movements enforces:
- A posted movement cannot be updated; correction must use reversal.
- A cancelled movement cannot be reactivated or changed.
- A draft may remain draft or transition to posted/cancelled only.
- A posted transition requires posted_by and posted_at metadata.
- A cancelled transition must not have posting metadata.

The separate BEFORE DELETE guard rejects every delete regardless of movement status. Therefore the supported business lifecycle (cancel draft / reverse posted) is not equivalent to a test-data purge mechanism. The final reset design must not pretend that ordinary lifecycle actions erase ledger history.

### 21.2 Valuation insert consistency and identity gap

The live valuation insert validator requires:
- a referenced movement exists and is posted;
- transaction_type equals movement_type;
- Product ID and Warehouse ID match the movement;
- quantity_delta matches the movement.

The inspected validator does not compare Product Variant ID because its selected movement identity is Product ID. This is another active product-level contract and must be redesigned with the canonical Variant contract. The separate update/delete triggers still make valuation rows immutable.

### 21.3 Product-oriented RPC behavior

The active SECURITY DEFINER product-oriented functions reviewed include:
- create_inventory_movement_by_product(...)
- create_inventory_transfer_by_product(...)
- post_goods_receipt_by_product(...)
- post_stock_opname_unlocked(...)

Observed behavior:
- Movement creation validates Product tracking_type and writes Product ID to a draft movement. Quantity-tracked Products reject product_unit_id; IMEI/Serial products require a specific Product Unit and movement quantity magnitude 1.
- Transfer creation reads and locks inventory_balances using product_id + warehouse_id, checks Product tracking_type, and writes transfer_out/transfer_in movement pairs with Product ID.
- Goods Receipt posting is implemented through the Product-oriented receipt path and creates Product-level inventory movement/unit records.
- Stock Opname posting inserts/locks/updates inventory_balances using product_id + warehouse_id, creates Product-level adjustment movements and valuation logs, and skips per-unit IMEI/Serial variance in the inspected path.
- These function definitions are not a valid implementation of the accepted Variant SKU stock identity. The reset decision does not remove the need to implement and test the canonical posting contract before reseeding inventory.

### 21.4 Serialized identifier validation

The live unit-identifier validator checks that:
- the Product Unit exists;
- when both Product ID and Variant parent Product ID are present, they match;
- IMEI identifiers are used only for IMEI-tracked Products;
- Serial identifiers are limited to the configured IMEI/Serial tracking types.

This validation does not make Product Variant ID mandatory. Existing Product Units with NULL Variant IDs therefore remain unresolved under the current contract.

### 21.5 SKU registry trigger side effects and ACL

The SECURITY DEFINER sync_sku_registry() trigger function:
- derives the entity type and identity from Products or Product Variants;
- removes the matching registry row when a Product/Variant is deleted;
- inserts or updates the registry on creation/change;
- uses transaction-scoped advisory locks for SKU keys;
- rejects a collision when the key is owned by a different entity.

The function is owned by postgres and the inspected ACL grants execution to postgres/service_role; application synchronization occurs through its trigger. A future catalog reset must validate that the registry is empty or exactly synchronized after the approved catalog operation. Do not manually delete registry entries in parallel with trigger-driven deletion.

### 21.6 Privilege boundary

The reviewed product-level movement and transfer creation RPCs are SECURITY DEFINER and their observed ACL includes authenticated. The reviewed posting helper post_stock_opname_unlocked(uuid) is SECURITY DEFINER but its observed ACL is restricted to postgres/service_role. Trigger guard functions are not general reset APIs.

Any future replacement or reset helper must have an explicit privilege review, fixed search_path, narrow execution grants, caller authorization where relevant, and a verified rollback path. No ACL or function was changed during this review.

**Conclusion:** Current live posting and validation code is Product-oriented, and the immutable ledger guards intentionally prevent destructive correction. The reset operation cannot safely precede the canonical Variant-level posting implementation and a separately verified recovery mechanism. MD-014 remains P0 / BLOCKING.


## 22. Catalog test-label screening — not sufficient for deletion classification

A read-only heuristic scan checked whether selected master records contain the text TEST in their code/name fields. Results:

| Entity | Total | Test-labelled |
|---|---:|---:|
| Products | 31 | 2 |
| Product Variants | 23 | 0 |
| Brands | 8 | 0 |
| Product Categories | 15 | 0 |
| Product Models | 2 | 0 |
| Suppliers | 3 | 0 |
| Customers | 1 | 0 |
| Warehouses | 2 | 1 |

This is only a label-based screening signal. It does not establish that a row is disposable or that a row without TEST is production-ready master data. In particular:
- The 2 test-labelled Products still have dependent Variants, attribute mappings, SKU registry entries and potentially transaction references.
- No Variant SKU contains TEST under the tested expression, but that does not make the 23 Variants canonical or safe to retain.
- One Warehouse is test-labelled, but Warehouses are referenced by inventory, PO/GR, Stock Opname and user warehouse access. Preserve both until the canonical warehouse set and access mapping are explicitly approved.
- Supplier and Customer names/codes do not contain TEST, but their business legitimacy has not been independently established.

Therefore no catalog or warehouse row is reclassified from REVIEW to RESET solely by this heuristic. The canonical catalog and warehouse seed list remains a required business decision before final manifest approval.


## 23. FK edge usage and catalog/warehouse record-level classification

A fresh read-only inspection retrieved public table definitions, FK constraints, and row usage for the major reset parent entities. The schema has 90 public FK constraints; the following usage counts show why catalog and warehouse rows cannot be classified only by their labels.

### 23.1 Current child-row usage by parent domain

| Parent relationship | Referencing rows | Reset implication |
|---|---:|---|
| Products → Product Variants | 23 | Variants are dependent master rows |
| Products → Product Attribute Assignments | 70 | Assignment rows must be handled before Products |
| Products → Inventory Balances | 16 | Balance rows must be rebuilt/reset before Product reset |
| Products → Inventory Movements | 9 | Ledger guard prevents direct deletion |
| Products → Inventory Valuation Logs | 9 | Immutable valuation guard prevents direct deletion |
| Products → Product Units | 3 | Unit identifier and Opname dependencies must be cleared first |
| Products → Purchase Order Items | 11 | PO detail dependencies |
| Products → Stock Opname Items | 140 | Opname detail dependencies |
| Variants → Product Variant Attribute Values | 74 | Variant attribute rows are FK-restricted |
| Variants → Product Units with non-NULL Variant | 0 | Current Product Units have no Variant identity |
| Variants → Purchase Order Items with non-NULL Variant | 4 | Four invalid cross-Product references found in prior audit |
| Variants → Stock Opname Items with non-NULL Variant | 25 | 25 invalid cross-Product references found in prior audit |
| Warehouses → Purchase Orders | 7 | Both warehouse IDs may be referenced by PO |
| Warehouses → Goods Receipts | 3 | GR references must be cleared before warehouse reset |
| Warehouses → Inventory Balances | 16 | Inventory state references warehouses |
| Warehouses → Inventory Movements | 9 | Movement ledger references warehouses |
| Warehouses → Inventory Valuation Logs | 9 | Valuation ledger references warehouses |
| Warehouses → Product Units | 3 | Serialized units reference warehouses |
| Warehouses → Stock Opname Sessions | 4 | Opname sessions reference warehouses |
| Suppliers → Purchase Orders | 7 | Supplier records are transaction parents |
| Suppliers → Goods Receipts | 3 | Supplier records are transaction parents |
| Suppliers → Supplier Addresses | 2 | Supplier address child rows |
| Suppliers → Supplier Contacts / Bank Accounts / Product Suppliers | 0 / 0 / 0 | Empty child tables in this snapshot |
| Categories → Products (category or subcategory populated) | 30 | Category hierarchy is referenced by 30 Products |
| Models → Products | 1 | Model master is referenced |
| Brands → Products / Product Models | 33 | Brand master is referenced |
| Attributes → Product Attribute Assignments | 70 | Attribute master is referenced |
| Assignments/Values → Product Variant Attribute Values | 74 | Attribute assignments and values are referenced |
| Auth user references in PO, Opname and Supplier records | 145 | Keep bootstrap Auth user; transaction rows depend on it |

Counts above are child-table row counts for the listed relationship. Where multiple FK paths exist between the same pair of tables, a row may satisfy more than one relationship; do not sum these figures as unique records.

### 23.2 Current catalog record names and classification

The current Product set includes:
- Operational-looking HXA SKU records HXA-000001 through HXA-000021.
- Explicitly test-labelled Products TEST-HEXA-001 and TEST-IPHONE-001.
- Separate IPH- and SS-FOLD-prefixed product records.
- Multiple distinct Product IDs with repeated descriptions, including repeated Samsung S20 Ultra entries and two iPhone 18 Pro entries.

The current Product Variant table contains 23 rows, and none has TEST in variant_sku under the screening expression. This does not establish that the variants are canonical; prior audit findings show several cross-Product links in PO, Opname and balances.

Brands currently include Apple, HEXA GROUP, Infinix, Xiaomi, Nubia, Oppo, Samsung and Vivo. Categories include accessories, electronic components, computer/laptop, networking, smartphones/tablets and secondhand categories. Two model rows are SAM-FOLD / Galaxy Z Fold and SS-FOLD / SAMSUNG FOLD.

The Product names/descriptions and SKU patterns indicate that the 31 Products are not safely classifiable as all-test or all-canonical. In particular, HXA-000001 through HXA-000004 are connected to the earlier Goods Receipt/IMEI/Inventory evidence. The current test decision authorizes eventual reset of application-entered test transactions, but does not independently prove which master rows should be retained or reseeded.

**Disposition:** Products, Product Variants, Product Attribute Assignments/Values, Brands, Categories and Models remain REVIEW / RESEED. No catalog record is individually approved for deletion in this audit.

### 23.3 Warehouse classification — explicit test record is referenced

Two warehouses currently exist:
- WH-SOL-001 — GUDANG JAKPUS.
- WH-TEST-001 — GUDANG TESTING.

The test-labelled warehouse is not orphaned: warehouse FK usage includes 7 PO, 3 GR, 16 balance, 9 movement, 9 valuation, 3 Product Unit and 4 Stock Opname Session rows across the two warehouse IDs. The inspection did not yet split every one of those counts by warehouse ID in this pass.

**Disposition:** Keep both warehouse master rows for now. The final transaction reset manifest must remove the dependent test transactions and balances first; only after a separate canonical warehouse decision may WH-TEST-001 be considered for removal. Preserve the operational warehouse and its ID/access relationships.

### 23.4 Supplier and Customer classification

Current Suppliers:
- SUP-000002 — ASIA PHONE.
- SUP-000003 — CV. STG.
- SUP-001 — PT. SSB.

The three Supplier records are referenced by 7 Purchase Orders, 3 Goods Receipts and 2 Supplier Addresses in total. Supplier master deletion is therefore not a safe shortcut for transaction cleanup. Preserve supplier master rows pending confirmation of canonical vendor set; Supplier Addresses require their own classification.

Current Customer:
- CUST-00001 — wahyu anggara.

No Sales/Customer transaction FK was identified in the reviewed reset graph, but the Customer row is not proven disposable. Keep pending business classification; do not delete solely because it is the only row.

### 23.5 Supabase project and recovery control status

A current project metadata read confirms Development project status ACTIVE_HEALTHY on PostgreSQL 17.11. The Supabase project branch listing returned no development branches.

No backup listing, restorable backup identifier, PITR point selector, or restore drill result was available from the inspected Supabase tools. WAL archive statistics remain evidence of WAL archiving only, not a verified complete backup. Do not invoke project restore or branch reset as an alternative: those operations can replace or lose untracked data and are not authorized by the current scope.

### 23.6 Remaining gates before exact reset manifest

The FK graph and catalog screening are now sufficiently detailed to reject blanket catalog/warehouse deletion, but an executable reset manifest is still blocked by:
1. no verified backup/PITR restore point and no tested recovery path;
2. no canonical Product/Variant seed list or confirmation of which current master IDs are retained;
3. no canonical warehouse set confirmation;
4. movement/valuation immutability guards, which rule out direct DELETE;
5. incomplete per-warehouse transaction dependency split and final per-row reset manifest;
6. need for canonical Variant-level posting implementation and migration before rebuilding stock.

No data or schema changed. No reset, truncate, migration, restore, branch reset, trigger disablement, ACL modification, or Production operation was performed.


## 24. Per-warehouse reset dependency split

A read-only join of each warehouse-bearing transaction/inventory table to the current Warehouse master was completed. The exact current distribution is:

| Table | WH-SOL-001 (GUDANG JAKPUS) | WH-TEST-001 (GUDANG TESTING) | Total |
|---|---:|---:|---:|
| Purchase Orders | 7 | 0 | 7 |
| Goods Receipts | 3 | 0 | 3 |
| Inventory Balances | 14 | 2 | 16 |
| Inventory Movements | 7 | 2 | 9 |
| Inventory Valuation Logs | 7 | 2 | 9 |
| Product Units | 2 | 1 | 3 |
| Stock Opname Sessions | 4 | 0 | 4 |

Implications:
- WH-TEST-001 has no current PO, GR, or Stock Opname Session header rows, but it is not unused: it has 2 balance rows, 2 movement rows, 2 valuation rows, and 1 Product Unit.
- The 2 movement and 2 valuation rows in WH-TEST-001 must be traced to their source/reference groups before any reset approach is designed.
- All PO/GR/Opname session headers currently point to WH-SOL-001. The test warehouse must not be deleted until the dependent balance, movement, valuation, and Product Unit references have been handled through a valid approved recovery/reset process.
- All 3 Goods Receipts are currently associated with WH-SOL-001. This does not mean the received inventory is valid at Variant level; prior audit sections document the Product-only and cross-Product identity defects.
- The 4 Opname Sessions are all under WH-SOL-001; their 140 item rows and 3 unit-count rows remain child dependencies.

This completes the warehouse-level count split for the seven tables listed. It does not yet prove row-level transaction ancestry or identify a supported way to remove immutable ledger rows. The final manifest must include source-reference/group linkage and exact IDs, not just table counts.

No database changes were performed.


## 25. Posted movement source-reference inventory

A fresh read-only query enumerated all 9 Inventory Movements with Product SKU, warehouse, status, quantity, Product Unit, group and source references. All 9 are **posted**; there are no draft movement rows in the current snapshot.

| Movement ID | Product | Warehouse | Type | Qty | Source |
|---|---|---|---|---:|---|
| b7663ef8-3f11-4e4a-8f0e-c22dac4c6a55 | IPH-15-256-WHT | WH-SOL-001 | purchase | +10 | GR-20261116-C6BB0763 |
| 1e616624-d093-4778-a7fa-e6407a55acff | HXA-000002 | WH-SOL-001 | purchase | +1 | GR-20261117-78177A18 |
| 21fc072f-f17f-4292-a8b3-ca82ee729322 | HXA-000004 | WH-SOL-001 | purchase | +1 | GR-20261117-78177A18 |
| 99fcb4cc-8700-430c-9dc8-289b9dbb6f65 | HXA-000003 | WH-SOL-001 | purchase | +1 | GR-20261117-78177A18 |
| 59dcf90a-9bb5-4ff9-81c3-052cf2064bbc | IPH-15-256-WHT | WH-SOL-001 | transfer_out | -1 | TRF-1E071C072558 |
| 54ccd2ef-3bd3-4bc9-89fc-9e91bd836d5f | HXA-000002 | WH-SOL-001 | transfer_out | -1 | TRF-419BEDC4804A |
| b543a882-91ef-41d8-bd36-d9abac536783 | TEST-HEXA-001 | WH-SOL-001 | purchase | +1 | GR-20261120-2770CA9C |
| e448ab47-1545-47ff-9341-83bef0fb487b | IPH-15-256-WHT | WH-TEST-001 | transfer_in | +1 | TRF-1E071C072558 |
| d5e037e3-7911-4eef-bfb2-3ff2363a668f | HXA-000002 | WH-TEST-001 | transfer_in | +1 | TRF-419BEDC4804A |

### 25.1 Transfer group completeness

Two posted transfer groups are confirmed:
- TRF-1E071C072558: IPH-15-256-WHT, one transfer_out (-1) from WH-SOL-001 and one transfer_in (+1) to WH-TEST-001.
- TRF-419BEDC4804A: HXA-000002, one transfer_out (-1) from WH-SOL-001 and one transfer_in (+1) to WH-TEST-001; both rows reference the same Product Unit.

Both groups are complete in movement row count and quantity arithmetic. Both remain Product-oriented with NULL Variant identity. The transfer group IDs/source references must be treated as indivisible pairs in any reset design; never plan one side independently.

### 25.2 Reset consequence

All movement rows are posted and protected by the immutable movement lifecycle/delete guard. Reversing these movements would create additional ledger history rather than remove test data, and would not satisfy the user's selected reset disposition. The valuation rows are separately immutable. A reset that claims to clear all test transaction history therefore requires a supported Development restore/reseed or a separately engineered, explicitly approved administrative reset mechanism with verified recovery and a documented audit boundary. Neither is currently confirmed or authorized.

No movement, transfer, valuation, or balance row was modified.
