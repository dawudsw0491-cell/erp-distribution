# MD-014 — Canonical Variant-Level Inventory Implementation

**Backlog:** MD-014 (P0)  
**Status:** Phase 1 movement/valuation source port committed; database application blocked by legacy Product-only identities  
**Environment:** Development only for future validation; no live database mutation is authorized by this document  
**Branch:** `fix/engineering-governance-masterdata-consolidation-20261120`

## 1. Objective

Make Product Variant SKU the sole stock identity across balances, movements, valuation, Goods Receipt, transfers, reversals, serialized units, and Stock Opname. A Product is a catalog parent; it is not a stock bucket.

Canonical stock key:

`(product_variant_id, warehouse_id)`

IMEI is optional unit-level identification. It never replaces the Variant SKU. Quantity not associated with a registered IMEI remains aggregate quantity under the same Variant SKU.

## 2. Verified root cause

The repository contains two incompatible implementation generations:

- Variant-oriented baseline: `database/26`, `29`, `33`–`35`, `44`, `47`–`49`.
- Product-oriented rewrite: `database/57_optional_imei_goods_receipt.sql`, `58_stock_opname_mixed_imei_count.sql`, and `59_optional_imei_inventory_movement.sql`.

The latter changes Goods Receipt, movement creation/posting, transfer, and mixed-IMEI Stock Opname to use `product_id`. Live Development has the product-level balance unique key and product-level posting functions. Application movement and transfer actions also call the `*_by_product` RPCs.

A partial change to only the balance constraint, one page, or one RPC would leave the other posting paths incompatible.

## 3. Canonical data contract

### 3.1 Inventory balances

- Exactly one balance row per Variant SKU and Warehouse.
- Unique key: `(product_variant_id, warehouse_id)`.
- Every balance row must reference an existing Product Variant.
- Product identity, if retained as a denormalized compatibility column, must equal `product_variants.product_id`.
- All quantity buckets, on-hand quantity, inventory value, and moving-average cost are maintained at this key.
- No Product-only balance may be created by application RPCs.

### 3.2 Movements and valuation

- Every new movement must reference `product_variant_id`.
- Movement warehouse and Variant identity are immutable after posting.
- Product ID must not be independently supplied as a second source of identity.
- Valuation log Variant and Warehouse must match the linked movement; quantity/value deltas must reconcile with that movement and resulting balance.
- Posted movements and valuation logs remain append-only. No trigger bypass or deletion path is introduced for reset.

### 3.3 Goods Receipt and Purchase Orders

- Every PO line receiving inventory must resolve to a Variant that belongs to the selected Product.
- GR item inherits the PO line Variant; client-supplied Product/Variant pairs are not trusted.
- Quantity-tracked products create aggregate movement by Variant.
- IMEI products may register zero through received quantity identified units. The untagged remainder posts as aggregate Variant quantity.
- Serial-tracked products require an individual serial for every received unit.
- Unit cost, shipping allocation, discounts, and recoverable tax treatment remain consistent with the established purchasing cost contract.

### 3.4 Product units and identifiers

- Every identified unit references a Product Variant and Warehouse.
- IMEI/Serial identifier uniqueness and format validation remain enforced.
- Optional IMEI does not make Product Variant optional.
- Unit movement and aggregate quantity movement must not double-count the same received quantity.

### 3.5 Transfer

- Transfer source and destination movements must carry the same Variant ID, quantity, inventory status, and movement group.
- Source and destination balances are locked in deterministic order by Variant + Warehouse.
- Serialized-unit transfer uses one registered unit; aggregate transfer uses NULL Product Unit ID and an integer quantity for IMEI-tracked products.
- Posting both sides is one transaction; a half-posted transfer is invalid.

### 3.6 Reversal

- Reversal must reference an original movement and use the same Variant identity.
- Reversal quantity and value are bounded by the original unreversed amount.
- Posting reversal updates only the corresponding Variant + Warehouse balance and appends valuation history.
- No reversal is used as a substitute for the selected test-data reset.

### 3.7 Stock Opname

- Snapshot includes active Variant SKUs, including zero-stock variants, for all inventory buckets.
- Count, reconciliation, approval, and posting operate on Variant IDs.
- IMEI aggregate count is separate from registered-unit presence counts, but both reconcile to the same Variant SKU.
- Posting revalidates the snapshot against the current Variant + Warehouse balance under lock.
- Positive adjustments require a valid moving-average cost; negative adjustments cannot create negative stock/value.
- Posted Opname history remains immutable.

## 4. Implementation work packages

1. **Schema and invariant layer:** inspect the actual live constraints and source migration provenance; design a Variant + Warehouse unique key and cross-parent consistency enforcement. Add preflight assertions so migration fails closed if legacy Product-only rows remain. Do not fabricate mappings.
2. **Movement API:** replace Product-only movement creation and posting with Variant-keyed RPC contracts. Retain authorization, warehouse scope, status transition validation, and function ACLs.
3. **Goods Receipt:** derive Variant from the PO line; post identified and aggregate quantities against that Variant; reject PO lines whose Product and Variant parent disagree.
4. **Transfer and reversal:** align draft creation and posting to Variant identity; preserve atomic pair posting and append-only valuation.
5. **Stock Opname:** port mixed-IMEI aggregate/unit logic to Variant identity, including snapshot, count, reconcile, review, approval, and posting.
6. **Application contract:** update movement, transfer, balances, units, Opname, Goods Receipt detail and Dashboard queries/forms to pass and display Variant IDs/SKUs consistently.
7. **Verification:** replay the source migration chain on a clean disposable Development baseline; run SQL transaction tests and authenticated role/warehouse tests; run local lint, typecheck and build; verify Preview and business-flow smoke tests.
8. **Reset readiness:** only after canonical posting passes, finish backup/restore verification and the exact reset manifest. Reset remains a separately approved operation.

## 5. Legacy data and reset boundary

The current Development data is not a safe migration source for inferred Variant mapping:

- Nine posted movements and nine valuation logs are linked one-to-one, but all nine have NULL Variant IDs.
- The valuation rows match their movements by Product, Warehouse, and Variant nullness; that is relational consistency, not proof of correct Variant identity.
- The reviewed PO/GR lineage contains Product/Variant parent mismatches and three IMEI units without a Variant identity.
- The two transfer groups are Product-only and must remain indivisible in any reset manifest.
- Product-only and cross-parent legacy rows must not be mapped from SKU labels, descriptions, or test fixture names.

The selected disposition is reset of application-entered test transactions after the canonical contracts are implemented and validated. This document does not authorize DELETE, TRUNCATE, trigger changes, migration application, restore, branch reset, or Production changes.

## 6. Required preflight and acceptance tests

- Reject PO item where `purchase_order_items.product_id <> product_variants.product_id`.
- Reject movement creation without a Variant or with mismatched Product/Variant parent.
- Verify one and only one balance per Variant + Warehouse.
- Post quantity GR, IMEI GR with all units identified, IMEI GR with partial/no identifiers, and Serial GR.
- Verify total posted quantity equals received quantity and no double counting occurs.
- Verify transfer out/in pair has identical Variant and exact opposite quantity.
- Verify reversal cannot exceed original unreversed movement quantity/value.
- Verify Stock Opname snapshot/count/reconcile/post for quantity, IMEI aggregate + identified units, and Serial.
- Verify concurrent postings cannot overspend a Variant balance.
- Verify rollback leaves no partial movement, valuation, balance, unit, or source-document status change.
- Verify RLS, `inventory.*` permissions, and warehouse boundaries for every public RPC.
- Verify valuation log read access is warehouse-scoped; treat this as a separately reviewed security change, not an incidental side effect.
- Verify no new Product-only balance, movement, valuation, or Product Unit can be written.

## 7. Explicit non-goals

- No Sales schema or Delivery Order posting until MD-014 passes.
- No reset execution in this work package.
- No Production deployment, database migration application, destructive DDL/DML, trigger disabling, or ACL/RLS relaxation.
- No unrelated Master Data or UI redesign.


## 8. Execution update — 2026-11-22

- Implemented the Variant-level `post_inventory_movement_unlocked` port in migration `supabase/migrations/20261122072517_md014_variant_inventory_movement.sql` using the established Variant-oriented source behavior from `database/33_inventory_posting_functions.sql`.
- Ported `create_goods_receipt` and `post_goods_receipt` from the optional-IMEI contract while resolving Product Variant from the locked PO item. The port rejects Product/Variant parent mismatch, preserves PO quantity checks, discounts, taxes, proportional shipping allocation, and purchasing permissions. IMEI receipt permits zero through received quantity identified units; registered units post individually and the untagged remainder posts once as aggregate Variant quantity. Serial receipt still requires one serial identifier per received unit.
- Revoked direct execution of Product-only Goods Receipt RPCs in the final migration contract; the application must be updated to call the canonical Variant-level endpoints before this migration can be applied.
- Preserved the public posting wrapper, warehouse lock, authentication and `inventory.update` permission check, approval separation and `finance.approve` requirement, movement-type restrictions, serialized-unit checks, per-status bucket validation, moving-average calculation, valuation append, and internal function EXECUTE restriction.
- Added fail-closed preflight for Product-only balances, movements, valuation logs and Product Units; added Variant `NOT NULL` invariants, Variant + Warehouse uniqueness, and composite Product/Variant parent constraints. Existing `uq_product_variants_id_product` was verified and reused rather than recreated.
- The current Development snapshot still contains legacy rows with NULL `product_variant_id`, so the migration preflight intentionally blocks. In addition, Product-level Goods Receipt, transfer/reversal, and Stock Opname paths remain active; applying the current migration before those ports and the application contract are complete would break those paths. The migration has not been run against Development; no database objects or rows were changed.
- Source commits: `8199c4e0ab87973bc47894ebbf0f75115fcaac8e` (initial port), followed by `27e70fdc714609048f6ac33ba62b5e469f1e6fd` (redundant DDL correction).
- Ported Variant-level `create_inventory_transfer` and `post_inventory_transfer_unlocked`, preserving warehouse lock wrapper, two-movement pairing, exact opposite quantities, valuation transfer, unit-state checks and aggregate IMEI transfers without Product Unit creation. Ported quantity-only `post_inventory_reversal_unlocked` while retaining the existing public wrapper and original valuation/reversal limits.
- Ported Stock Opname count, bulk count, unit count, snapshot, reconciliation, review and posting functions. Snapshot is per active Variant/status bucket including zero-stock SKUs. IMEI snapshot separates registered units from aggregate remainder; reconciliation and posting operate on Variant + Warehouse. Added aggregate count columns and Variant uniqueness/FK constraints.
- Ported `create_purchase_order` to accept `product_variant_id` and derive denormalized `product_id` from the Variant parent. Added fail-closed PO identity preflight and composite parent FK.
- Updated application purchase order form/page/actions to select Variant SKU and call canonical PO/GR RPCs. Updated transfer and movement forms/actions to select Variant SKU and call canonical Variant RPCs. Updated Stock Opname unit association to match Product Units by `product_variant_id`; IMEI aggregate count UI now compares against aggregate snapshot rather than total serialized-plus-aggregate stock.
- Static checks are not SQL parser/replay evidence. The purchase-order function terminator was corrected after source inspection. No migration has been executed against Development; no DB objects or rows changed.
- Remaining implementation: finish Stock Opname Variant SKU display and any remaining read/query contracts; inspect all app RPC call sites and SQL function signatures/ACLs; replay migration on a clean disposable baseline; run lint, TypeScript, build, authenticated permission/warehouse-boundary, IMEI partial receipt, transfer, reversal, Stock Opname, concurrency and rollback tests. Prepare reset/reconciliation manifest and backup/restore evidence separately. No reset or Production operation is authorized.
