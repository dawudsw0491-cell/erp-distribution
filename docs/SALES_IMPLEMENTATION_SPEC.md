# Sales Implementation Specification

**Backlog:** SALES-001  
**Status:** Phase 1 design baseline; implementation not yet applied  
**Scope:** Existing ERP Sales workflow only. This document does not introduce a separate CRM, fulfillment, or accounting module.

## 1. Business lifecycle

1. Sales Order (SO) records the customer's order commitment.
2. A confirmed SO creates a soft stock demand for its remaining undelivered quantity.
3. One SO may be fulfilled by multiple Delivery Orders (DOs).
4. Each posted DO records only its own delivered quantity as sales recognition and reduces inventory in the same database transaction.
5. Sales Invoice is a billing document only. It must not reduce inventory or recognize the same sale again.

## 2. Phase boundaries

### Phase 1 — Sales Order and Delivery Order

- Sales Order list, create, detail, edit while draft, confirm, and cancel while no quantity has been delivered.
- Delivery Order list, create from a confirmed SO, detail, and post.
- Partial fulfillment and outstanding/backorder quantity.
- Soft reservation visibility and stock validation.
- Warehouse scope and module permissions.
- Atomic DO posting with inventory movement and sales recognition.
- No direct application writes to inventory balances.

### Phase 2 — Sales Invoice

- Invoice one eligible posted DO or group multiple eligible posted DOs.
- Every invoice line references its source DO line.
- Cumulative billed quantity must not exceed delivered quantity.
- Partial delivered-but-unbilled quantity remains invoiceable.
- Invoice posting does not repeat inventory reduction or sales recognition.
- Invoice issue/receivable/tax/accounting behavior is gated by separately accepted finance decisions.

## 3. Core entities and ownership

Use existing master entities: customers, products, product_variants, and warehouses. Sales line items must reference the canonical Product and Product Variant IDs; do not duplicate product/customer/warehouse master records.

Initial transaction entities are limited to:
- Sales Order header and lines.
- Delivery Order header and lines.
- Sales Invoice header and lines in Phase 2.

Do not add standalone reservation, CRM, fulfillment, shipment, or accounting submodules. Soft reservation is derived from eligible confirmed Sales Order line balances, not a separately maintained stock ledger, unless concurrency testing proves a dedicated allocation record is necessary.

## 4. Soft reservation and stock rules

- Only confirmed SOs reserve demand.
- Reservation quantity per SO line = ordered quantity minus quantities on posted DO lines.
- Cancelled or fully delivered SO lines do not reserve stock.
- Reservation order is deterministic: earlier confirmation timestamp first, then stable SO number/ID tie-breaker.
- Reservation is warehouse-specific. Do not silently substitute another warehouse.
- No automatic expiry. A confirmed SO remains active until fulfilled or explicitly cancelled under permitted rules.
- On Hand, Reserved, and Available must be shown distinctly. Available stock for DO posting is derived from the existing sellable inventory bucket and eligible soft reservations; quarantine, damaged, repair, and non-sellable stock cannot satisfy a DO.
- Posting revalidates and allocates stock inside the database transaction. Concurrent postings must serialize against the same warehouse/product identity and cannot double-consume stock or create negative balances.
- A DO can consume the current SO's eligible reservation only after higher-priority confirmed demand is respected.
- Backorder is the remaining SO quantity not yet delivered; it is not an inventory movement.

## 5. Posting and integrity rules

- Draft SO/DO records do not affect inventory or recognized sales.
- SO confirmation does not change inventory balances.
- DO posting is the single operational recognition boundary.
- DO posting must atomically: lock the relevant SO/DO rows and inventory scope; validate status, permissions, warehouse access, remaining SO quantity, reservation priority, product tracking rules and stock; create and post the outbound inventory movement using the established posting boundary; mark DO lines and header posted; update SO fulfillment state; record posted metadata.
- If any step fails, all writes in the transaction roll back.
- IMEI/Serial support must follow the existing Product tracking policy. Do not invent a parallel serialized inventory mechanism.
- Posted DOs are immutable. Corrections require an explicit reversal workflow and corresponding inventory reversal; no direct edit/delete of posted documents.

## 6. Sales Invoice guardrails (Phase 2)

- User may invoice one posted DO or combine eligible posted DOs.
- Group only records with the same customer, currency, and compatible invoice-level tax/payment configuration.
- Every invoice line references one source DO line.
- Lock source DO lines during invoice posting; cumulative invoiced quantity cannot exceed delivered quantity.
- A partially invoiced DO line retains its uninvoiced balance.
- Invoice posting is billing only; no new inventory movement and no duplicate sales recognition.
- Do not post receivables, tax, COGS, revenue journal, or general-ledger entries until their own accounting decisions and ledger architecture are accepted.

## 7. Authorization and warehouse boundaries

Use the existing getAuthorizationContext application pattern and existing RBAC helpers/RLS approach. Add only the permissions needed for Sales Order and Delivery Order actions, following existing naming conventions after verifying the live permission catalogue. Every header and child write must enforce warehouse access, including SECURITY DEFINER RPC boundaries. Never widen access to make a screen work.

## 8. Required verification

- Migration replay from a clean baseline and development migration-ledger reconciliation.
- RLS and role allow/deny tests.
- Warehouse boundary tests.
- SO create/edit/confirm/cancel tests.
- Multiple partial DOs against one SO.
- Backorder and soft-reservation priority tests.
- Concurrent DO posting against the same stock.
- Insufficient stock and transaction rollback tests.
- Aggregate quantity and IMEI/Serial tests where the product tracking type requires them.
- Inventory balance, movement, valuation, and sales recognition reconciliation.
- Preview deployment READY and authenticated end-to-end smoke tests.

## 9. Explicit exclusions until separately approved

- Customer credit blocking/limit enforcement.
- Payment collection and settlement.
- Accounts Receivable ledger.
- Tax calculation/reporting.
- Revenue/COGS journal and General Ledger.
- Returns/credit notes and posted-document reversal UI.
- Cross-warehouse auto-substitution.
- External carrier/shipping integrations.

These are not silently inferred from customer master fields or existing inventory movement types.


## 10. Implementation blocker — inventory variant granularity

A live Development schema inspection on 2026-11-21 found that `inventory_balances` has the unique constraint `(product_id, warehouse_id)`. The current `post_inventory_movement_unlocked` implementation locks and updates the balance using `product_id + warehouse_id`; it does not partition the balance by `product_variant_id`. Although `inventory_movements`, `inventory_balances`, and `product_units` contain nullable `product_variant_id` columns, this does not provide independent stock balances for multiple variants of one Product.

This conflicts with the accepted product identity model in which each Product Variant has its own immutable SKU and stock must be attributable to that SKU. Sales Order reservation, Delivery Order availability checks, and outbound posting cannot safely be implemented at variant level until Inventory supports a canonical balance key of `product_variant_id + warehouse_id` (or a formally accepted equivalent that preserves SKU-level stock identity).

Required prerequisite work under Inventory / MD-010 integration:
- Inspect all existing Inventory read/write RPCs, balance views, valuation logs, stock opname, transfers, Goods Receipt, and product-unit tracking for assumptions that balances are product-level.
- Define a non-destructive migration from current product-level rows to variant-level balances. Do not guess a variant assignment for historical aggregate balances where the source cannot prove it.
- Update all stock movement posting and valuation paths to lock and update the canonical stock key consistently, including quantity-tracked and IMEI/Serial-tracked products.
- Add uniqueness, FK, RLS, warehouse scope, and concurrency controls for variant-level balances.
- Verify existing historical movements reconcile to opening balances and valuation totals; ambiguous legacy balances must remain explicitly unresolved rather than silently allocated.
- Run Goods Receipt, Inventory Movement, Transfer, Stock Opname, and valuation regression tests before unblocking SALES-001.

No Sales migration or live schema change is authorized by this finding. Sales implementation remains blocked until this prerequisite is source-committed, validated in Development, and its migration/legacy-data reconciliation evidence is recorded.


### 10.1 Expanded blocker evidence — source and UI contract divergence

The follow-up read-only audit found that the conflict is broader than the original live balance key:

- Variant-oriented migrations 26, 29, 33–35, and 44–49 define variant-based movement, balance, transfer, reversal, and Stock Opname paths.
- Later source migrations 57–59 redefine Goods Receipt, movement creation/posting, transfer helpers, and mixed-IMEI Stock Opname around `product_id`.
- Current Inventory server actions `app/inventory/movements/actions.ts` and `app/inventory/transfers/actions.ts` call RPCs with `p_product_id`.
- The live Development database currently uses product-level posting and has 11 of 16 balance rows with NULL `product_variant_id`; some of those rows have non-zero on-hand quantity/value. Existing product-only movement and IMEI unit history also cannot be assigned to a variant from those rows alone.
- The complete evidence, exact source references, and non-destructive remediation phases are recorded in `docs/INVENTORY_VARIANT_IDENTITY_AUDIT.md`.

This means the Sales blocker cannot be resolved by changing the balance constraint alone or by introducing a second parallel variant balance table. All active posting/read paths and historical data treatment must be reconciled as one migration plan. SALES-001 remains blocked; no Sales schema or posting implementation is authorized before MD-014 passes its Development validation gates.
